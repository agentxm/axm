import type { McpDistribution, McpBinding, McpAuth } from "./connection.js";
/**
 * Writing MCP connections into agent-native configuration, and withdrawing
 * them: the writer side of the target plan.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import {
  CONFIGURABLE_AGENTS_BY_ID,
  CONFIGURABLE_AGENT_IDS,
  type McpConfigTarget,
} from "@agentxm/extension-model/unstable/agent-capabilities";
import { resolveNativeReadLocation, type NativeDirectoryInputs } from "../../locations/index.js";
import { preflightNativeConfigReaders } from "../native-config-readers.js";
import { McpConfigInvalid, McpDefinitionInvalid, McpSharedTargetConflict } from "../errors.js";
import type { CodingAgentFailure } from "../errors.js";
import {
  MCP_SERVER_MANIFEST_FILENAME,
  type McpServerManifest,
} from "@agentxm/extension-model/unstable/mcps/manifest-schema";
import type { NativeWriteAuthority } from "../native-write-authority.js";
import {
  removeAgentMcpConfigs,
  validateAgentMcpConfigRemovals,
  validateAgentMcpConfigWrite,
  writeAgentMcpConfig,
  type RemoveAgentMcpConfigsArgs,
} from "./config-writer.js";
import {
  readNativeMcpConfig,
  readNativeMcpValues,
  resolveAgentMcpConfigTargetPath,
} from "./native-config.js";
import {
  planMcpServerTargets,
  unresolvedMcpAgentTargets,
  type McpAgentTargetPlan,
  type McpTargetPlan,
  type McpTargetWrite,
} from "./target-plan.js";
import { resolveConfiguredMcpTargets } from "./targeting.js";
import type {
  AddMcpServerArgs,
  McpServerSyncOutcome,
  McpServerSyncTarget,
  RemoveMcpServerArgs,
} from "../agents/coding-agent.js";
import type { McpServerDeclaration } from "./expected-entry.js";
import { decodeMcpServerManifestAt } from "./manifest.js";
import { readPluginMcpDefinition, type PluginMcpDefinition } from "./plugin-definition.js";
import type { NativeMcpComponent } from "@agentxm/extension-model/unstable/extensions/refs/mcp-server";
import { resolveSharedMcpContainer } from "./shared-target.js";

/** Readback proves native content; running-agent selection remains unobservable here. */
const describePhysicalConsumers = (args: {
  readonly workspaceRoot: string;
  readonly nativeDirectoryInputs: NativeDirectoryInputs;
  readonly scope: "project" | "user";
  readonly physicalPath: string;
  readonly agentIds: ReadonlyArray<string>;
  readonly targets: ReadonlyArray<McpServerSyncTarget>;
}) =>
  Effect.gen(function* () {
    if (args.targets.length === 0) return args.targets;
    const raw = Option.getOrElse(yield* readNativeMcpConfig(args.physicalPath), () => "");
    const path = yield* Path.Path;
    const potentialReaders: Array<string> = [];
    const physicalPaths = new Map<string, string>();
    for (const agentId of CONFIGURABLE_AGENT_IDS) {
      const native = CONFIGURABLE_AGENTS_BY_ID[agentId].capabilities["mcp-server"].native;
      if (!("locations" in native)) continue;
      for (const location of native.locations) {
        const resolved = resolveNativeReadLocation(
          path,
          agentId,
          location,
          args,
          args.nativeDirectoryInputs,
        );
        if (resolved === undefined) continue;
        const declared = {
          scope: location.scope,
          nativeRoot: resolved.nativeRoot,
          path: resolved.path,
          format: location.format,
          attribution: location.attribution ?? ("agent" as const),
        };
        const physical =
          physicalPaths.get(resolved.path) ??
          (yield* resolveAgentMcpConfigTargetPath(args.workspaceRoot, declared).pipe(
            Effect.option,
          ));
        const physicalPath =
          typeof physical === "string" ? physical : Option.getOrUndefined(physical);
        if (physicalPath === undefined) continue;
        physicalPaths.set(resolved.path, physicalPath);
        if (physicalPath !== args.physicalPath) continue;
        if (!args.agentIds.includes(agentId)) {
          potentialReaders.push(agentId);
          break;
        }
        if (location.keyPath !== undefined)
          yield* readNativeMcpValues({
            configPath: args.physicalPath,
            raw,
            format: location.format,
            serversPath: location.keyPath,
          });
      }
    }
    return args.targets.map((target): McpServerSyncTarget =>
      target.nativeLocation === undefined
        ? target
        : {
            ...target,
            nativeLocation: {
              ...target.nativeLocation,
              configuredConsumers: [...new Set(args.agentIds)].sort(),
              potentialReaders: potentialReaders.sort(),
              availability: [...new Set(args.agentIds)].sort().map((agentId) => ({
                agentId,
                state: "unverified",
                reason:
                  "Native config readback verified; agent configuration selection is not observable",
              })),
            },
          },
    );
  });

export interface SyncInlineMcpServerArgs {
  readonly workspaceRoot: string;
  readonly nativeDirectoryInputs: NativeDirectoryInputs;
  readonly serverName: string;
  readonly entry: McpServerDeclaration;

  readonly scope?: "project" | "user";
}

export interface SyncManifestMcpServerArgs extends Omit<
  AddMcpServerArgs,
  "owner" | "resolvedVersion"
> {
  readonly agentIds: ReadonlyArray<string>;
}

export interface ValidateManifestMcpServerTargetsArgs {
  readonly workspaceRoot: string;
  readonly nativeDirectoryInputs: NativeDirectoryInputs;
  readonly manifest: McpServerManifest;
  readonly agentIds: ReadonlyArray<string>;
  readonly scope: "project" | "user";
  readonly serverName: string;
  readonly distribution?: McpDistribution;
  readonly bindings?: ReadonlyArray<McpBinding>;
  readonly auth?: McpAuth;
  readonly enabled: boolean;
}

/** A plan whose readers all accept their shared entries, or the conflict that stops it. */
const plannedTargets = (
  plan: McpTargetPlan,
): Effect.Effect<
  Extract<McpTargetPlan, { readonly _tag: "planned" }>,
  McpDefinitionInvalid | McpSharedTargetConflict
> => {
  if (plan._tag === "invalid") {
    return Effect.fail(new McpDefinitionInvalid({ detail: plan.detail, cause: plan.cause }));
  }
  const blocked = plan.agents.find((agent) => agent._tag === "blocked");
  return blocked !== undefined && blocked._tag === "blocked"
    ? Effect.fail(new McpSharedTargetConflict({ reason: blocked.reason }))
    : Effect.succeed(plan);
};

/** Recheck every declared alias and all file contracts before the first native write. */
const validatePlannedWrites = (
  configuredAgentIds: ReadonlyArray<string>,
  workspaceRoot: string,
  serverName: string,
  writes: ReadonlyArray<McpTargetWrite>,
  authority: {
    readonly nativeDirectoryInputs: NativeDirectoryInputs;
  },
  adoptions?: ReadonlyArray<{
    readonly filePath: string;
    readonly expectedEntry: Readonly<Record<string, unknown>>;
  }>,
) =>
  Effect.gen(function* () {
    for (const write of writes) {
      for (const target of write.declaredTargets) {
        const current = yield* resolveAgentMcpConfigTargetPath(workspaceRoot, target);
        if (current !== write.path) {
          return yield* new McpConfigInvalid({
            detail: `MCP location changed before writing: ${target.path}`,
          });
        }
      }
      yield* preflightNativeConfigReaders({
        nativeDirectoryInputs: authority.nativeDirectoryInputs,
        workspaceRoot,
        scope: write.target.scope,
        physicalPath: write.path,
        configuredAgentIds,
        writerFormat: write.target.format,
        raw: Option.getOrElse(yield* readNativeMcpConfig(write.path), () => ""),
      });
      if (write.agentIds.includes("pi")) {
        const entries = yield* readNativeMcpValues({
          configPath: write.path,
          raw: Option.getOrElse(yield* readNativeMcpConfig(write.path), () => ""),
          format: write.target.format,
          serversPath: write.config.serversPath,
        });
        const normalizedName = serverName.replaceAll("-", "_");
        if (
          Object.keys(entries).some(
            (name) => name !== serverName && name.replaceAll("-", "_") === normalizedName,
          )
        ) {
          return yield* new McpConfigInvalid({
            detail: "Pi server names collide after native hyphen/underscore normalization",
          });
        }
      }
      const adoption = adoptions?.find((entry) => entry.filePath === write.path);
      const proposedRaw = yield* validateAgentMcpConfigWrite({
        workspaceRoot,
        serverName,
        serversPath: write.config.serversPath,
        target: write.target,
        entry: write.entry,

        ...(adoption === undefined ? {} : { adoption }),
      });
      yield* preflightNativeConfigReaders({
        nativeDirectoryInputs: authority.nativeDirectoryInputs,
        workspaceRoot,
        scope: write.target.scope,
        physicalPath: write.path,
        configuredAgentIds,
        writerFormat: write.target.format,
        raw: Option.getOrElse(yield* readNativeMcpConfig(write.path), () => ""),
        proposedRaw,
      });
    }
  });

/** Resolve physical sharing and preflight inline native entries without publishing settings. */
export const validateInlineMcpServerTargets = (
  agentIds: ReadonlyArray<string>,
  args: SyncInlineMcpServerArgs & {
    readonly adoptions?: ReadonlyArray<{
      readonly filePath: string;
      readonly expectedEntry: Readonly<Record<string, unknown>>;
    }>;
  },
) =>
  Effect.gen(function* () {
    const groups = yield* resolveConfiguredMcpTargets({
      nativeDirectoryInputs: args.nativeDirectoryInputs,
      workspaceRoot: args.workspaceRoot,
      agentIds,
      scope: args.scope ?? "project",
    });
    const plan = yield* plannedTargets(
      planMcpServerTargets({
        agentIds,
        groups,
        scope: args.scope ?? "project",
        serverName: args.serverName,
        declaration: args.entry,
        resolvedCwd:
          args.entry.connection?.transport === "stdio" &&
          args.entry.connection.cwd?.base === "scope"
            ? (yield* Path.Path).resolve(args.workspaceRoot, args.entry.connection.cwd.path)
            : undefined,
        enabled: args.entry.enabled ?? true,
      }),
    );
    yield* validatePlannedWrites(
      agentIds,
      args.workspaceRoot,
      args.serverName,
      plan.writes,
      args,
      args.adoptions,
    );
    return plan;
  });

/** Write every planned shared file once and report the targets each agent gained. */
const applyPlannedWrites = (
  configuredAgentIds: ReadonlyArray<string>,
  workspaceRoot: string,
  serverName: string,
  writes: ReadonlyArray<McpTargetWrite>,
  authority: {
    readonly nativeDirectoryInputs: NativeDirectoryInputs;
  },
): Effect.Effect<
  ReadonlyMap<string, ReadonlyArray<McpServerSyncTarget>>,
  CodingAgentFailure,
  FileSystem.FileSystem | Path.Path | NativeWriteAuthority
> =>
  Effect.gen(function* () {
    yield* validatePlannedWrites(configuredAgentIds, workspaceRoot, serverName, writes, authority);
    const path = yield* Path.Path;
    const targetsByAgent = new Map<string, Array<McpServerSyncTarget>>();
    for (const write of writes) {
      const result = yield* writeAgentMcpConfig({
        workspaceRoot,
        serverName,
        serversPath: write.config.serversPath,
        target: write.target,
        entry: write.entry,

        aliases: [
          ...new Set(
            write.declaredTargets.map((target) =>
              path.resolve(
                workspaceRoot,
                target.scope === "user" && target.path.startsWith("~/")
                  ? target.path.slice(2)
                  : target.path,
              ),
            ),
          ),
        ].sort(),
      });
      const targets = yield* describePhysicalConsumers({
        nativeDirectoryInputs: authority.nativeDirectoryInputs,
        workspaceRoot,
        scope: write.target.scope,
        physicalPath: write.path,
        agentIds: write.agentIds,
        targets: result.targets,
      });
      for (const agentId of write.agentIds) {
        const existing = targetsByAgent.get(agentId) ?? [];
        targetsByAgent.set(agentId, [...existing, ...targets]);
      }
    }
    return targetsByAgent;
  });

/** Collapse all destinations into one outcome per requested agent without losing changed targets. */
export const mcpAgentSyncOutcome = (
  agents: ReadonlyArray<McpAgentTargetPlan>,
  targets: ReadonlyArray<McpServerSyncTarget>,
): McpServerSyncOutcome => {
  const warnings = [
    ...new Set(agents.flatMap((agent) => ("warnings" in agent ? agent.warnings : []))),
  ];
  const facts = { targets, ...(warnings.length === 0 ? {} : { warnings }) };
  const failures = agents.flatMap((agent) =>
    agent._tag === "unverified" || agent._tag === "blocked" ? [agent.reason] : [],
  );
  if (failures.length > 0) return { ...facts, _tag: "failed", reason: failures.join("; ") };
  if (agents.some((agent) => agent._tag === "needs-input"))
    return { ...facts, _tag: "needs-input", reason: warnings.join("; ") };
  const unavailable = agents.flatMap((agent) =>
    agent._tag === "nothing-runnable" || agent._tag === "unsupported" ? [agent.reason] : [],
  );
  if (unavailable.length > 0)
    return {
      ...facts,
      _tag: agents.some((agent) => agent._tag === "nothing-runnable")
        ? "nothing-runnable"
        : "unsupported",
      reason: unavailable.join("; "),
    };
  return { ...facts, _tag: "success" };
};

/** Project one inline server into every configured agent that shares its files. */
export const syncInlineMcpServerToAgents = (
  agentIds: ReadonlyArray<string>,
  args: SyncInlineMcpServerArgs,
): Effect.Effect<
  ReadonlyArray<McpServerSyncOutcome>,
  CodingAgentFailure,
  FileSystem.FileSystem | Path.Path | NativeWriteAuthority
> =>
  Effect.gen(function* () {
    const groups = yield* resolveConfiguredMcpTargets({
      nativeDirectoryInputs: args.nativeDirectoryInputs,
      workspaceRoot: args.workspaceRoot,
      agentIds,
      scope: args.scope ?? "project",
    });
    const plan = yield* plannedTargets(
      planMcpServerTargets({
        agentIds,
        groups,
        scope: args.scope ?? "project",
        serverName: args.serverName,
        declaration: args.entry,
        resolvedCwd:
          args.entry.connection?.transport === "stdio" &&
          args.entry.connection.cwd?.base === "scope"
            ? (yield* Path.Path).resolve(args.workspaceRoot, args.entry.connection.cwd.path)
            : undefined,
        enabled: args.entry.enabled ?? true,
      }),
    );
    const written = yield* applyPlannedWrites(
      agentIds,
      args.workspaceRoot,
      args.serverName,
      plan.writes,
      args,
    );
    return agentIds.map((agentId) =>
      mcpAgentSyncOutcome(
        plan.agents.filter((agent) => agent.agentId === agentId),
        written.get(agentId) ?? [],
      ),
    );
  });

interface McpRemovalGroup {
  readonly nativeDirectoryInputs: NativeDirectoryInputs;
  readonly path: string;
  readonly agentIds: ReadonlyArray<string>;
  readonly declaredTargets: ReadonlyArray<McpConfigTarget>;
  readonly removal: RemoveAgentMcpConfigsArgs;
  readonly retained: ReadonlyArray<McpServerSyncTarget>;
  readonly configuredConsumers: ReadonlyArray<string>;
}

const planMcpRemovals = (
  agentIds: ReadonlyArray<string>,
  args: {
    readonly workspaceRoot: string;
    readonly nativeDirectoryInputs: NativeDirectoryInputs;
    readonly scope: "project" | "user";
    readonly disableOnly: boolean;
    readonly configuredConsumerIds?: ReadonlySet<string>;
    readonly selection: { readonly kind: "remove"; readonly serverName: string };
  },
) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const groups = yield* resolveConfiguredMcpTargets({
      nativeDirectoryInputs: args.nativeDirectoryInputs,
      agentIds,
      workspaceRoot: args.workspaceRoot,
      scope: args.scope,
    });
    const plans: Array<McpRemovalGroup> = [];
    for (const group of groups) {
      if (group.unverifiedReaders.length > 0)
        return yield* new McpSharedTargetConflict({ reason: group.unverifiedReaders.join("; ") });
      const consumers = group.members.filter((member) =>
        args.configuredConsumerIds === undefined
          ? member.configured
          : args.configuredConsumerIds.has(member.agentId),
      );
      // With no remaining consumers, withdrawal still needs one declared parser
      // for the selected container; potential readers do not add new constraints.
      const withdrawalWriter = [...group.members]
        .filter((member) => member.configured)
        .sort((left, right) => left.agentId.localeCompare(right.agentId))
        .slice(0, 1);
      const shared = resolveSharedMcpContainer({
        members: consumers.length > 0 ? consumers : withdrawalWriter,
        negotiateActivation: args.disableOnly,
      });
      if (shared._tag === "conflict")
        return yield* new McpSharedTargetConflict({ reason: shared.reason });
      const declaredTargets = group.members.map((member) => member.declaredTarget ?? member.target);
      const aliases = [
        ...new Set(
          declaredTargets.map((target) =>
            path.resolve(
              args.workspaceRoot,
              target.scope === "user" && target.path.startsWith("~/")
                ? target.path.slice(2)
                : target.path,
            ),
          ),
        ),
      ].sort();
      const raw = yield* readNativeMcpConfig(group.path);
      yield* preflightNativeConfigReaders({
        nativeDirectoryInputs: args.nativeDirectoryInputs,
        workspaceRoot: args.workspaceRoot,
        scope: args.scope,
        physicalPath: group.path,
        configuredAgentIds:
          args.configuredConsumerIds === undefined ? agentIds : [...args.configuredConsumerIds],
        writerFormat: shared.target.format,
        raw: Option.getOrElse(raw, () => ""),
      });
      const names = [args.selection.serverName];
      const configuredConsumers = shared.agentIds.filter(
        (agentId) =>
          agentIds.includes(agentId) &&
          (args.configuredConsumerIds === undefined || args.configuredConsumerIds.has(agentId)),
      );
      const removal: RemoveAgentMcpConfigsArgs = {
        workspaceRoot: args.workspaceRoot,
        serverNames: names,
        serversPath: shared.config.serversPath,
        target: shared.target,
        activationField: shared.config.activationField,
        disableOnly: args.disableOnly,
        aliases,
      };
      plans.push({
        nativeDirectoryInputs: args.nativeDirectoryInputs,
        path: group.path,
        agentIds: shared.agentIds.filter((agentId) => agentIds.includes(agentId)),
        configuredConsumers,
        retained: [],
        declaredTargets,
        removal,
      });
    }
    // Every co-reader's common grammar and every outgoing entry is checked
    // before any physical target is changed.
    for (const plan of plans) {
      for (const declared of plan.declaredTargets) {
        if ((yield* resolveAgentMcpConfigTargetPath(args.workspaceRoot, declared)) !== plan.path)
          return yield* new McpConfigInvalid({
            detail: `MCP location changed before removal: ${declared.path}`,
          });
      }
      const proposedRaw = yield* validateAgentMcpConfigRemovals(plan.removal);
      yield* preflightNativeConfigReaders({
        nativeDirectoryInputs: args.nativeDirectoryInputs,
        workspaceRoot: args.workspaceRoot,
        scope: args.scope,
        physicalPath: plan.path,
        configuredAgentIds: plan.configuredConsumers,
        writerFormat: plan.removal.target.format,
        raw: Option.getOrElse(yield* readNativeMcpConfig(plan.path), () => ""),
        proposedRaw,
      });
    }
    return {
      plans,
      unresolved: agentIds.flatMap((agentId) =>
        unresolvedMcpAgentTargets(agentId, args.scope, groups),
      ),
    };
  });

const applyMcpRemovals = (
  agentIds: ReadonlyArray<string>,
  planned: {
    readonly plans: ReadonlyArray<McpRemovalGroup>;
    readonly unresolved: ReadonlyArray<McpAgentTargetPlan>;
  },
  dryRun: boolean,
) =>
  Effect.gen(function* () {
    const byAgent = new Map<string, Array<McpServerSyncTarget>>();
    for (const plan of planned.plans) {
      const changed: Array<McpServerSyncTarget> = [...plan.retained];
      for (const declared of plan.declaredTargets) {
        if (
          (yield* resolveAgentMcpConfigTargetPath(plan.removal.workspaceRoot, declared)) !==
          plan.path
        )
          return yield* new McpConfigInvalid({
            detail: `MCP location changed before removal: ${declared.path}`,
          });
      }
      const result = yield* removeAgentMcpConfigs({ ...plan.removal, dryRun });
      changed.push(
        ...(yield* describePhysicalConsumers({
          nativeDirectoryInputs: plan.nativeDirectoryInputs,
          workspaceRoot: plan.removal.workspaceRoot,
          scope: plan.removal.target.scope,
          physicalPath: plan.path,
          agentIds: plan.configuredConsumers,
          targets: result.targets,
        })),
      );
      for (const agentId of plan.agentIds) {
        const existing = byAgent.get(agentId) ?? [];
        byAgent.set(agentId, [...existing, ...changed]);
      }
    }
    return agentIds.map((agentId) =>
      mcpAgentSyncOutcome(
        planned.unresolved.filter((agent) => agent.agentId === agentId),
        byAgent.get(agentId) ?? [],
      ),
    );
  });

const manifestDeclaration = (args: {
  readonly distribution?: McpDistribution | undefined;
  readonly bindings?: ReadonlyArray<McpBinding> | undefined;
  readonly auth?: McpAuth | undefined;
  readonly enabled?: boolean | undefined;
}): McpServerDeclaration => ({
  kind: "configuration",
  distribution: args.distribution,
  bindings: args.bindings,
  auth: args.auth,
  enabled: args.enabled,
});

/** Refuse a manifest whose shared targets cannot hold one entry every reader accepts. */
export const validateManifestMcpServerTargets = (args: ValidateManifestMcpServerTargetsArgs) =>
  Effect.gen(function* () {
    const groups = yield* resolveConfiguredMcpTargets(args);
    const plan = yield* plannedTargets(
      planMcpServerTargets({
        agentIds: args.agentIds,
        groups,
        scope: args.scope,
        serverName: args.serverName,
        declaration: manifestDeclaration(args),
        manifest: args.manifest,
        enabled: args.enabled,
      }),
    );
    yield* validatePlannedWrites(
      args.agentIds,
      args.workspaceRoot,
      args.serverName,
      plan.writes,
      args,
    );
  });

export interface ValidatePluginMcpServerTargetsArgs extends Omit<
  ValidateManifestMcpServerTargetsArgs,
  "manifest"
> {
  readonly source: string;
  readonly definition: PluginMcpDefinition;
}

/** Validate the selected native component with the same target plan used to write it. */
export const validatePluginMcpServerTargets = (args: ValidatePluginMcpServerTargetsArgs) =>
  Effect.gen(function* () {
    const plan = yield* plannedTargets(
      planMcpServerTargets({
        groups: yield* resolveConfiguredMcpTargets(args),
        agentIds: args.agentIds,
        scope: args.scope,
        serverName: args.serverName,
        declaration: {
          kind: "sourced",
          source: args.source,
          ...(args.distribution === undefined ? {} : { distribution: args.distribution }),
          ...(args.bindings === undefined ? {} : { bindings: args.bindings }),
          ...(args.auth === undefined ? {} : { auth: args.auth }),
          enabled: args.enabled,
        },
        nativeDefinition: args.definition,
        enabled: args.enabled,
      }),
    );
    yield* validatePlannedWrites(
      args.agentIds,
      args.workspaceRoot,
      args.serverName,
      plan.writes,
      args,
    );
  });

export interface SyncPluginMcpServerArgs extends Omit<
  SyncManifestMcpServerArgs,
  "owner" | "resolvedVersion"
> {
  readonly source: string;
  readonly nativeComponent: NativeMcpComponent;
}

/** Project only a selected plugin connection, retaining its original package as content. */
export const syncPluginMcpServerToAgents = (args: SyncPluginMcpServerArgs) =>
  Effect.gen(function* () {
    if (args.agentIds.length === 0) return [];
    const definition = yield* readPluginMcpDefinition(args.canonicalPath, args.nativeComponent);
    const plan = yield* plannedTargets(
      planMcpServerTargets({
        groups: yield* resolveConfiguredMcpTargets({ ...args, scope: args.scope ?? "project" }),
        agentIds: args.agentIds,
        scope: args.scope ?? "project",
        serverName: args.serverName,
        declaration: {
          kind: "sourced",
          source: args.source,
          ...(args.distribution === undefined ? {} : { distribution: args.distribution }),
          ...(args.bindings === undefined ? {} : { bindings: args.bindings }),
          ...(args.auth === undefined ? {} : { auth: args.auth }),
          enabled: args.enabled ?? true,
        },
        nativeDefinition: definition,
        enabled: args.enabled ?? true,
      }),
    );
    const written = yield* applyPlannedWrites(
      args.agentIds,
      args.workspaceRoot,
      args.serverName,
      plan.writes,
      args,
    );
    return args.agentIds.map((agentId) =>
      mcpAgentSyncOutcome(
        plan.agents.filter((agent) => agent.agentId === agentId),
        written.get(agentId) ?? [],
      ),
    );
  });

/** Project one manifest-backed server while treating each shared file as one decision. */
export const syncManifestMcpServerToAgents = (
  args: SyncManifestMcpServerArgs,
): Effect.Effect<
  ReadonlyArray<McpServerSyncOutcome>,
  CodingAgentFailure,
  FileSystem.FileSystem | Path.Path | NativeWriteAuthority
> =>
  Effect.gen(function* () {
    if (args.agentIds.length === 0) return [];
    const path = yield* Path.Path;
    const manifest = yield* decodeMcpServerManifestAt(
      path.join(args.canonicalPath, MCP_SERVER_MANIFEST_FILENAME),
    );
    const plan = yield* plannedTargets(
      planMcpServerTargets({
        groups: yield* resolveConfiguredMcpTargets({
          nativeDirectoryInputs: args.nativeDirectoryInputs,
          workspaceRoot: args.workspaceRoot,
          agentIds: args.agentIds,
          scope: args.scope ?? "project",
        }),
        agentIds: args.agentIds,
        scope: args.scope ?? "project",
        serverName: args.serverName,
        declaration: manifestDeclaration(args),
        manifest,
        enabled: args.enabled ?? true,
      }),
    );
    const written = yield* applyPlannedWrites(
      args.agentIds,
      args.workspaceRoot,
      args.serverName,
      plan.writes,
      args,
    );
    return args.agentIds.map((agentId): McpServerSyncOutcome => {
      const outcome = mcpAgentSyncOutcome(
        plan.agents.filter((agent) => agent.agentId === agentId),
        written.get(agentId) ?? [],
      );
      return outcome;
    });
  });

/** Withdraw one selected entry after all configured physical consumers agree. */
export const removeMcpServerFromAgents = (
  agentIds: ReadonlyArray<string>,
  args: RemoveMcpServerArgs,
): Effect.Effect<
  ReadonlyArray<McpServerSyncOutcome>,
  CodingAgentFailure,
  FileSystem.FileSystem | Path.Path | NativeWriteAuthority
> =>
  Effect.gen(function* () {
    const plans = yield* planMcpRemovals(agentIds, {
      nativeDirectoryInputs: args.nativeDirectoryInputs,
      workspaceRoot: args.workspaceRoot,
      scope: args.scope ?? "project",
      disableOnly: args.disableOnly ?? false,
      selection: { kind: "remove", serverName: args.serverName },
    });
    return yield* applyMcpRemovals(agentIds, plans, args.dryRun === true);
  });
