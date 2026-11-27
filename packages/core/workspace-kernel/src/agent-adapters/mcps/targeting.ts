/**
 * Portable MCP server target grouping helpers.
 *
 * @experimental This API is unstable and may change without notice.
 */

import {
  AGENTS,
  CONFIGURABLE_AGENTS_BY_ID,
  McpServersPathSchema,
  type Agent,
  type McpConfig,
  type McpEntryDialect,
  type McpConfigTarget,
  type NativeConfigReadLocation,
  type McpTransport,
} from "@agentxm/extension-model/unstable/agent-capabilities";
import { isConfigurableAgentId } from "@agentxm/extension-model/unstable/agent-capabilities/identity";
import type { ResolvedMcpConfig, SharedMcpTargetMember } from "./shared-target.js";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Result from "effect/Result";
import {
  resolveNativeReadLocation,
  resolveNativeReferent,
  captureNativeLocationSet,
  type NativeDirectoryInputs,
} from "../../locations/index.js";
import { readNativeMcpConfig, resolveAgentMcpConfigTargetPath } from "./native-config.js";
import { McpConfigInvalid } from "../errors.js";
import type { NativeConfigObservationDiagnostic } from "../native-config-observation.js";

import {
  readCompetingMcpEntries,
  type CompetingMcpEntry,
  type CompetingMcpObservation,
} from "./competing-entries.js";

type AgentMcpCapability = Agent["capabilities"]["mcp-server"];
export type ReadableMcpCapability = AgentMcpCapability & {
  readonly native: Extract<
    AgentMcpCapability["native"],
    { readonly transports: ReadonlyArray<McpTransport> }
  > & {
    readonly entryDialect: McpEntryDialect;
  };
};
export type ConfiguredMcpCapability = ReadableMcpCapability & {
  readonly axm: { readonly writer: { readonly config: McpConfig } };
};

const isReadableMcpCapability = (
  capability: AgentMcpCapability,
): capability is ReadableMcpCapability =>
  "entryDialect" in capability.native && capability.native.entryDialect !== null;
export const readableMcpCapability = (agentId: string): ReadableMcpCapability | undefined => {
  if (!isConfigurableAgentId(agentId)) return undefined;
  const capability = CONFIGURABLE_AGENTS_BY_ID[agentId].capabilities["mcp-server"];
  return isReadableMcpCapability(capability) ? capability : undefined;
};
const isConfiguredMcpCapability = (
  capability: AgentMcpCapability,
): capability is ConfiguredMcpCapability =>
  capability.axm.writer !== null && isReadableMcpCapability(capability);

/** The native MCP capability for an agent whose configuration AXM can write. */
export const configuredMcpCapability = (agentId: string): ConfiguredMcpCapability | undefined => {
  if (!isConfigurableAgentId(agentId)) return undefined;
  const capability = CONFIGURABLE_AGENTS_BY_ID[agentId].capabilities["mcp-server"];
  return isConfiguredMcpCapability(capability) ? capability : undefined;
};

export const declaredMcpWriterTargets = (
  capability: ConfiguredMcpCapability,
): ReadonlyArray<{
  readonly location: NativeConfigReadLocation;
  readonly target: McpConfigTarget;
  readonly config: ResolvedMcpConfig;
}> =>
  capability.native.locations.flatMap((location) => {
    if (!capability.axm.writer.config.locationIds.includes(location.id)) return [];
    const serversPath = location.keyPath;
    const attribution = location.attribution;
    if (!Schema.is(McpServersPathSchema)(serversPath) || attribution === undefined) return [];
    return [
      {
        location,
        target: {
          scope: location.scope,
          path: location.path,
          format: location.format,
          attribution,
        },
        config: { ...capability.native.entryDialect, serversPath },
      },
    ];
  });

export interface McpTargetGroup {
  readonly key: string;
  readonly path: string;
  readonly members: ReadonlyArray<SharedMcpTargetMember>;
  readonly unverifiedReaders: ReadonlyArray<string>;
  readonly competingEntries?: ReadonlyArray<CompetingMcpEntry>;
}

const groupMembers = (
  members: ReadonlyArray<SharedMcpTargetMember>,
): ReadonlyArray<McpTargetGroup> => {
  const groups = new Map<
    string,
    { readonly path: string; readonly members: Array<SharedMcpTargetMember> }
  >();
  for (const member of members) {
    const key = `${member.target.scope}:${member.target.path}`;
    const group = groups.get(key) ?? { path: member.target.path, members: [] };
    group.members.push(member);
    groups.set(key, group);
  }
  return [...groups.entries()].map(([key, group]) => ({ key, ...group, unverifiedReaders: [] }));
};

/**
 * Read each applicable native location independently. Mutation planning keeps
 * its strict resolver below, including competing-entry and shared-writer checks.
 */
export const observeNativeMcpTargets = Effect.fnUntraced(function* (args: {
  readonly agentIds: ReadonlyArray<string>;
  readonly scope: "project" | "user";
  readonly workspaceRoot: string;
  readonly nativeDirectoryInputs: NativeDirectoryInputs;
}) {
  const path = yield* Path.Path;
  const readers = args.agentIds.flatMap((agentId) => {
    const capability = readableMcpCapability(agentId);
    if (capability === undefined) return [];
    return capability.native.locations.flatMap((location) => {
      const resolved = resolveNativeReadLocation(
        path,
        agentId,
        location,
        args,
        args.nativeDirectoryInputs,
      );
      if (resolved === undefined || !Schema.is(McpServersPathSchema)(location.keyPath)) return [];
      const target: McpConfigTarget = {
        scope: location.scope,
        nativeRoot: resolved.nativeRoot,
        path: resolved.path,
        format: location.format,
        attribution: location.attribution ?? "agent",
      };
      return [
        {
          agentId,
          locationId: location.id,
          configured: true,
          config: { ...capability.native.entryDialect, serversPath: location.keyPath },
          target,
          declaredTarget: target,
        } satisfies SharedMcpTargetMember,
      ];
    });
  });
  const observations = yield* captureNativeLocationSet({
    referents: readers.map((reader) => reader.target.path),
  });
  const members: Array<SharedMcpTargetMember> = [];
  const diagnostics = new Map<string, NativeConfigObservationDiagnostic>();
  for (const reader of readers) {
    const resolved = yield* Effect.gen(function* () {
      const captured = yield* observations.referent(reader.target.path);
      const current = yield* resolveAgentMcpConfigTargetPath(args.workspaceRoot, reader.target);
      if (current !== captured)
        return yield* new McpConfigInvalid({
          detail: `MCP location changed during observation: ${reader.target.path}`,
        });
      return captured;
    }).pipe(Effect.result);
    if (Result.isFailure(resolved)) {
      const address = {
        kind: "key-path" as const,
        path: reader.target.path,
        keys: reader.config.serversPath,
      };
      const key = JSON.stringify(address);
      const previous = diagnostics.get(key);
      diagnostics.set(key, {
        extensionType: "mcp-server",
        address,
        aliases: [...new Set([...(previous?.aliases ?? []), reader.target.path])].sort(),
        claimantAgentIds: [
          ...new Set([...(previous?.claimantAgentIds ?? []), reader.agentId]),
        ].sort(),
        stage: "resolve",
        cause: resolved.failure,
      });
      continue;
    }
    members.push({ ...reader, target: { ...reader.target, path: resolved.success } });
  }
  return { groups: groupMembers(members), diagnostics: [...diagnostics.values()] };
});

/** Catalog-only grouping; execution resolves captured roots and physical aliases below. */
export const groupConfiguredMcpTargets = (args: {
  readonly agentIds: ReadonlyArray<string>;
  readonly scope: "project" | "user";
}): ReadonlyArray<McpTargetGroup> =>
  groupMembers(
    args.agentIds.flatMap((agentId) => {
      const capability = configuredMcpCapability(agentId);
      return capability === undefined
        ? []
        : declaredMcpWriterTargets(capability).flatMap(({ location, target, config }) =>
            location.scope !== args.scope || location.applicability.kind !== "always"
              ? []
              : [
                  {
                    agentId,
                    locationId: location.id,
                    configured: true,
                    config,
                    target,
                    declaredTarget: target,
                  },
                ],
          );
    }),
  );

/**
 * The key of one live admission's result: the scope and native root it was
 * admitted under and the physical path it produced. A target without a
 * native root was never admitted by a resolution and has no key.
 */
export const mcpTargetAdmissionKey = (target: McpConfigTarget): string | undefined =>
  target.nativeRoot === undefined
    ? undefined
    : JSON.stringify([target.scope, target.nativeRoot, target.path]);

interface ConfiguredMcpTargetArgs {
  readonly agentIds: ReadonlyArray<string>;
  readonly scope: "project" | "user";
  readonly workspaceRoot: string;
  readonly nativeDirectoryInputs: NativeDirectoryInputs;
}

/**
 * Resolve captured scope roots before joining consumers to physical files,
 * with the admission key of every configured writer target this call admitted
 * live. Within the call, members that share a declared route admit it once,
 * and their competing-entry checks share each exact path spelling's bytes and
 * referent; every member still decodes with its own grammar. Only successes
 * are kept, because any failure ends the call.
 */
export const resolveConfiguredMcpTargetAdmissions = (args: ConfiguredMcpTargetArgs) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const members: Array<SharedMcpTargetMember> = [];
    const admitted: Array<string> = [];
    const admissions = new Map<string, string>();
    const admit = (declaredTarget: McpConfigTarget) => {
      const key = JSON.stringify([
        declaredTarget.scope,
        declaredTarget.nativeRoot ?? args.workspaceRoot,
        declaredTarget.path,
      ]);
      const known = admissions.get(key);
      return known !== undefined
        ? Effect.succeed(known)
        : resolveAgentMcpConfigTargetPath(args.workspaceRoot, declaredTarget).pipe(
            Effect.tap((physicalPath) => Effect.sync(() => admissions.set(key, physicalPath))),
          );
    };
    const reads = new Map<string, Option.Option<string>>();
    const referents = new Map<string, string>();
    const observe: CompetingMcpObservation = {
      read: (configPath) => {
        const known = reads.get(configPath);
        return known !== undefined
          ? Effect.succeed(known)
          : readNativeMcpConfig(configPath).pipe(
              Effect.tap((raw) => Effect.sync(() => reads.set(configPath, raw))),
            );
      },
      referent: (configPath) => {
        const known = referents.get(configPath);
        return known !== undefined
          ? Effect.succeed(known)
          : resolveNativeReferent(configPath).pipe(
              Effect.tap((physical) => Effect.sync(() => referents.set(configPath, physical))),
            );
      },
    };
    const declaredReaders = AGENTS.flatMap((agent) => {
      const native = agent.capabilities["mcp-server"].native;
      if (!("locations" in native)) return [];
      return native.locations.flatMap((location) => {
        const resolved = resolveNativeReadLocation(
          path,
          agent.id,
          location,
          args,
          args.nativeDirectoryInputs,
          { includeConditional: true },
        );
        return resolved === undefined ? [] : [{ agentId: agent.id, path: resolved.path }];
      });
    });
    const observations = yield* captureNativeLocationSet({
      referents: declaredReaders.map((reader) => reader.path),
    });
    for (const reader of declaredReaders) {
      if (!args.agentIds.includes(reader.agentId)) continue;
      yield* observations.referent(reader.path).pipe(
        Effect.mapError(
          (cause) =>
            new McpConfigInvalid({
              detail: `Cannot verify configured ${reader.agentId} MCP reader at ${reader.path}`,
              cause,
            }),
        ),
      );
    }
    for (const agentId of args.agentIds) {
      const capability = configuredMcpCapability(agentId);
      if (capability === undefined) continue;
      for (const { location, target, config } of declaredMcpWriterTargets(capability)) {
        const resolved = resolveNativeReadLocation(
          path,
          agentId,
          location,
          args,
          args.nativeDirectoryInputs,
        );
        if (resolved === undefined) continue;
        const declaredTarget = { ...target, nativeRoot: resolved.nativeRoot, path: resolved.path };
        // The captured read view never substitutes for live containment checks.
        const physicalPath = yield* admit(declaredTarget);
        const captured = yield* observations.referent(resolved.path).pipe(
          Effect.mapError(
            (cause) =>
              new McpConfigInvalid({
                detail: `Cannot observe MCP location ${resolved.path}`,
                cause,
              }),
          ),
        );
        if (captured !== physicalPath)
          return yield* new McpConfigInvalid({
            detail: `MCP location changed during observation: ${resolved.path}`,
          });
        const admittedTarget = { ...target, nativeRoot: resolved.nativeRoot, path: physicalPath };
        const admission = mcpTargetAdmissionKey(admittedTarget);
        if (admission !== undefined) admitted.push(admission);
        members.push({
          agentId,
          locationId: location.id,
          configured: true,
          config,
          target: admittedTarget,
          declaredTarget,
        });
      }
    }
    const groups = groupMembers(members);
    const result: Array<McpTargetGroup> = [];
    for (const group of groups) {
      const readers: Array<SharedMcpTargetMember> = [...group.members];
      const unverifiedReaders: Array<string> = [];
      for (const agent of AGENTS) {
        const native = agent.capabilities["mcp-server"].native;
        if (!("locations" in native)) continue;
        const locations: ReadonlyArray<NativeConfigReadLocation> = native.locations;
        for (const location of locations) {
          const resolved = resolveNativeReadLocation(
            path,
            agent.id,
            location,
            args,
            args.nativeDirectoryInputs,
            { includeConditional: true },
          );
          if (
            resolved === undefined ||
            readers.some(
              (member) => member.agentId === agent.id && member.locationId === location.id,
            )
          )
            continue;
          const target: McpConfigTarget = {
            scope: location.scope,
            nativeRoot: resolved.nativeRoot,
            path: resolved.path,
            format: location.format,
            attribution: location.attribution ?? "agent",
          };
          const observed = yield* observations.referent(resolved.path).pipe(Effect.option);
          if (Option.isNone(observed)) continue;
          const physicalPath = observed.value;
          if (physicalPath !== group.path) continue;
          const serversPath = location.keyPath;
          if (native.entryDialect === null || !Schema.is(McpServersPathSchema)(serversPath)) {
            if (args.agentIds.includes(agent.id) && location.applicability.kind === "always")
              unverifiedReaders.push(
                `${agent.id} has no verified entry dialect for native location '${location.id}'`,
              );
            continue;
          }
          readers.push({
            agentId: agent.id,
            locationId: location.id,
            configured:
              args.agentIds.includes(agent.id) && location.applicability.kind === "always",
            config: { ...native.entryDialect, serversPath },
            target: { ...target, nativeRoot: resolved.nativeRoot, path: physicalPath },
            declaredTarget: target,
          });
        }
      }
      const competingEntries: Array<CompetingMcpEntry> = [];
      for (const member of group.members) {
        const capability = configuredMcpCapability(member.agentId);
        if (capability === undefined) continue;
        const locations = capability.native.locations.flatMap((location) => {
          const resolved = resolveNativeReadLocation(
            path,
            member.agentId,
            location,
            args,
            args.nativeDirectoryInputs,
          );
          return resolved === undefined || location.keyPath === undefined
            ? []
            : [{ path: resolved.path, format: location.format, serversPath: location.keyPath }];
        });
        competingEntries.push(
          ...(yield* readCompetingMcpEntries(
            {
              agentId: member.agentId,
              target: member.target,
              serversPath: member.config.serversPath,
              locations,
              workspaceRoot: args.workspaceRoot,
              userHome: args.nativeDirectoryInputs.userHome,
              claudeConfigRoot: args.nativeDirectoryInputs.userConfigRootOverrides?.["claude-code"],
            },
            observe,
          )),
        );
      }
      result.push({ ...group, members: readers, unverifiedReaders, competingEntries });
    }
    return { groups: result, admitted: Object.freeze([...new Set(admitted)]) };
  });

/** Resolve captured scope roots before joining consumers to physical files. */
export const resolveConfiguredMcpTargets = (args: ConfiguredMcpTargetArgs) =>
  Effect.map(resolveConfiguredMcpTargetAdmissions(args), ({ groups }) => groups);
