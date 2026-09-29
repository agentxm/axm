/**
 * Read-only inventory of agent-native outputs and their ownership proofs.
 *
 * Output containers may be shared by several coding agents. An output is
 * desired when at least one claimant for its resolved container is desired and
 * its managed unit name is expected for that extension type.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import {
  resolveNativeEntry,
  resolveNativeReferent,
  readCopiedDirectory,
  resolveNativeReadLocation,
  type NativeDirectoryInputs,
} from "../locations/index.js";
import { isWithinOrEqual } from "@agentxm/extension-model/unstable/path-types";
import {
  resolveWorkspaceExtensionRef,
  type SkillEntry,
  type WorkspaceLayout,
} from "../workspace-state/index.js";
import {
  AGENTS as CAPABILITY_AGENTS,
  type NativeConfigReadLocation,
} from "@agentxm/extension-model/unstable/agent-capabilities";
import {
  ExtensionNameSchema,
  type PerAgentType,
} from "@agentxm/extension-model/unstable/extensions/common";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import { CodingAgentRepository } from "./agents/coding-agent-repository.js";
import {
  extensionNameFromFilename,
  safeReadDirectory,
  safeReadFileString,
  type WorkspaceOwnershipIssue,
} from "./managed-file-discovery.js";
import { managedFileMarker, managedFileFormatForPath } from "./managed-file-banner.js";
import { collectManagedAgentMcpServers } from "./mcps/inspection.js";
import {
  readAmbiguousHookCommands,
  readManagedHookUnits,
  type AxmMcpMetadata,
  type HookOwnership,
} from "../agent-adapters/index.js";

export type AgentOutputOwnershipProof =
  | "canonical-source-link"
  | "copied-directory-receipt"
  | "managed-banner"
  | "managed-mcp-entry"
  | "managed-hook-group";

export interface AgentOutputObservation {
  readonly extensionType: PerAgentType;
  readonly containerPath: string;
  readonly path: string;
  readonly entryName: string;
  readonly claimantAgentIds: ReadonlyArray<string>;
  readonly ownership: "owned" | "unowned";
  readonly proof?: AgentOutputOwnershipProof;
  readonly desired: boolean;
}

export interface AgentOutputInventory {
  readonly outputs: ReadonlyArray<AgentOutputObservation>;
  readonly ownedResidue: ReadonlyArray<AgentOutputObservation>;
  readonly unownedFootprints: ReadonlyArray<AgentOutputObservation>;
}

export interface ObserveAgentOutputsArgs {
  readonly workspaceRoot: string;
  readonly nativeDirectoryInputs: NativeDirectoryInputs;
  readonly scope: WorkspaceScope;
  readonly desiredAgentIds: ReadonlySet<string>;
  readonly expectedNames: Readonly<Record<PerAgentType, ReadonlySet<string>>>;
  readonly expectedHooks: ReadonlyArray<HookOwnership>;
  readonly expectedMcpEntries: Readonly<Record<string, ReadonlyArray<AxmMcpMetadata>>>;
  readonly expectedSkillSources: Readonly<Record<string, ReadonlyArray<string>>>;
  readonly expectedSubagentFiles: Readonly<
    Record<string, ReadonlyArray<{ readonly ext: string; readonly src: string }>>
  >;
  /**
   * The layout whose skill authoring folder holds authored packages, and local
   * declarations (including disabled skills) that mark bundled entries.
   */
  readonly authoredSkills: {
    readonly layout: WorkspaceLayout;
    readonly entries: Readonly<Record<string, SkillEntry>>;
  };
}

interface ResolvedContainer {
  readonly path: string;
  readonly agentId?: string;
  readonly sharedPolicy?: boolean;
}

const groupContainers = (containers: ReadonlyArray<ResolvedContainer>) =>
  Effect.gen(function* () {
    const grouped = new Map<string, { claimants: Set<string>; sharedPolicy: boolean }>();
    for (const container of containers) {
      const resolved = yield* resolveNativeReferent(container.path).pipe(Effect.option);
      if (Option.isNone(resolved)) continue;
      const group = grouped.get(resolved.value) ?? {
        claimants: new Set<string>(),
        sharedPolicy: false,
      };
      if (container.agentId !== undefined) group.claimants.add(container.agentId);
      group.sharedPolicy ||= container.sharedPolicy === true;
      grouped.set(resolved.value, group);
    }
    return [...grouped].map(([path, group]) => ({
      path,
      claimantAgentIds: [...group.claimants].sort(),
      sharedPolicy: group.sharedPolicy,
    }));
  });

const containerIsDesired = (
  claimantAgentIds: ReadonlyArray<string>,
  desiredAgentIds: ReadonlySet<string>,
): boolean => claimantAgentIds.some((agentId) => desiredAgentIds.has(agentId));

/**
 * A valid authored package — declared or not — is authored source, never an
 * agent output eligible for retirement or an unowned footprint.
 */
const isAuthoredSkillPackage = (
  args: ObserveAgentOutputsArgs["authoredSkills"],
  artifactPath: string,
  name: string,
) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    if (
      args.layout.scope !== "project" ||
      args.entries[name]?.origin === "bundled" ||
      !Schema.is(ExtensionNameSchema)(name) ||
      artifactPath !== path.join(args.layout.authoredRoot("skill"), name)
    )
      return false;

    // Failed validation supplies no exclusion: a lookalike remains visible to
    // ownership diagnostics and the package's own canonical-content diagnostics.
    const source = yield* resolveWorkspaceExtensionRef({
      settingsName: name,
      source: "workspace",
      expectedType: "skill",
      layout: args.layout,
      scope: args.layout.scope,
    }).pipe(Effect.option);
    return Option.isSome(source);
  });

/** Observe every known agent output without writing to the workspace. */
export const observeAgentOutputs = (
  args: ObserveAgentOutputsArgs,
): Effect.Effect<
  AgentOutputInventory,
  Config.ConfigError,
  CodingAgentRepository | FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const agentRepo = yield* CodingAgentRepository;
    const agents = yield* agentRepo.all;
    const outputs: Array<AgentOutputObservation> = [];
    const expectedSkillSources = new Map<string, ReadonlyArray<string>>();
    for (const [name, sources] of Object.entries(args.expectedSkillSources)) {
      const physical = yield* Effect.forEach(sources, (source) =>
        resolveNativeReferent(source).pipe(Effect.option),
      );
      expectedSkillSources.set(
        name,
        physical.flatMap((source) => (Option.isSome(source) ? [source.value] : [])),
      );
    }

    const skillContainers = yield* Effect.forEach(agents, (agent) =>
      agent
        .resolveNativeReadLocations({
          workspaceRoot: args.workspaceRoot,
          scope: args.scope,
          kind: "skill",
        })
        .pipe(
          Effect.map((locations) =>
            locations.map((location): ResolvedContainer => ({
              path: location.path,
              agentId: agent.id,
            })),
          ),
        ),
    ).pipe(Effect.map((containers) => containers.flat()));

    for (const container of yield* groupContainers([
      { path: path.join(args.workspaceRoot, ".agents/skills"), sharedPolicy: true },
      ...skillContainers,
    ])) {
      const desiredContainer =
        container.sharedPolicy ||
        containerIsDesired(container.claimantAgentIds, args.desiredAgentIds);
      for (const entry of yield* safeReadDirectory(fs, container.path)) {
        const artifactPath = path.join(container.path, entry);
        const address = yield* resolveNativeEntry(artifactPath).pipe(Effect.option);
        let proof: AgentOutputOwnershipProof | undefined;
        let extensionType: PerAgentType = "skill";
        if (
          Option.isSome(address) &&
          address.value.kind === "symlink" &&
          address.value.linkTarget !== undefined
        ) {
          const immediatePath = path.resolve(container.path, address.value.linkTarget);
          const immediate = yield* resolveNativeEntry(immediatePath).pipe(Effect.option);
          // Never follow a foreign leaf chain into the managed store for ownership.
          if (
            Option.isSome(immediate) &&
            immediate.value.kind !== "symlink" &&
            (expectedSkillSources.get(entry) ?? []).includes(immediate.value.entryPath)
          ) {
            proof = "canonical-source-link";
          }
        } else if (Option.isSome(address) && address.value.kind === "directory") {
          if (yield* isAuthoredSkillPackage(args.authoredSkills, artifactPath, entry)) continue;
          const receipt = yield* readCopiedDirectory(artifactPath);
          if (Option.isSome(receipt)) {
            const marker = managedFileMarker(
              yield* safeReadFileString(fs, path.join(artifactPath, "SKILL.md")),
              "markdown",
            );
            const expected = args.expectedSubagentFiles[entry] ?? [];
            const fallbackRoot = yield* resolveNativeReferent(
              path.join(args.workspaceRoot, ".axm/build/polyfills/subagents", entry),
            ).pipe(Effect.option);
            if (
              Option.isSome(marker) &&
              expected.some(
                (proof) => marker.value.ext === proof.ext && marker.value.src === proof.src,
              ) &&
              Option.isSome(fallbackRoot) &&
              isWithinOrEqual(path, fallbackRoot.value, receipt.value.source)
            ) {
              extensionType = "subagent";
              proof = "copied-directory-receipt";
            } else if ((expectedSkillSources.get(entry) ?? []).includes(receipt.value.source)) {
              proof = "copied-directory-receipt";
            }
          }
        }
        outputs.push({
          extensionType,
          containerPath: container.path,
          path: artifactPath,
          entryName: entry,
          claimantAgentIds: container.claimantAgentIds,
          ownership: proof === undefined ? "unowned" : "owned",
          ...(proof === undefined ? {} : { proof }),
          desired:
            (extensionType === "skill"
              ? desiredContainer
              : containerIsDesired(container.claimantAgentIds, args.desiredAgentIds)) &&
            args.expectedNames[extensionType].has(entry),
        });
      }
    }

    const subagentContainers = yield* Effect.forEach(agents, (agent) =>
      agent
        .resolveNativeReadLocations({
          workspaceRoot: args.workspaceRoot,
          scope: args.scope,
          kind: "subagent",
        })
        .pipe(
          Effect.map((locations) =>
            locations
              .filter((location) => location.declaration.shape === "directory")
              .map((location): ResolvedContainer => ({ path: location.path, agentId: agent.id })),
          ),
        ),
    ).pipe(Effect.map((containers) => containers.flat()));

    for (const container of yield* groupContainers(subagentContainers)) {
      const desiredContainer = containerIsDesired(container.claimantAgentIds, args.desiredAgentIds);
      for (const entry of yield* safeReadDirectory(fs, container.path)) {
        const artifactPath = path.join(container.path, entry);
        const stat = yield* fs.stat(artifactPath).pipe(Effect.option);
        if (stat._tag === "None" || stat.value.type !== "File") continue;
        const content = yield* safeReadFileString(fs, artifactPath);
        const entryName = extensionNameFromFilename(entry);
        const format = managedFileFormatForPath(artifactPath);
        const marker = format === undefined ? Option.none() : managedFileMarker(content, format);
        const expected = args.expectedSubagentFiles[entryName] ?? [];
        const managed =
          Option.isSome(marker) &&
          expected.some(
            (proof) => marker.value.ext === proof.ext && marker.value.src === proof.src,
          );
        const referent = yield* resolveNativeReferent(artifactPath).pipe(Effect.option);
        if (Option.isNone(referent)) continue;
        const prior = outputs.findIndex(
          (output) => output.extensionType === "subagent" && output.path === referent.value,
        );
        if (prior >= 0) {
          const observed = outputs[prior];
          if (observed !== undefined)
            outputs[prior] = {
              ...observed,
              claimantAgentIds: [
                ...new Set([...observed.claimantAgentIds, ...container.claimantAgentIds]),
              ].sort(),
              desired:
                observed.desired ||
                (desiredContainer && args.expectedNames.subagent.has(entryName)),
            };
          continue;
        }
        outputs.push({
          extensionType: "subagent",
          containerPath: path.dirname(referent.value),
          path: referent.value,
          entryName,
          claimantAgentIds: container.claimantAgentIds,
          ownership: managed ? "owned" : "unowned",
          ...(managed ? { proof: "managed-banner" } : {}),
          desired: desiredContainer && args.expectedNames.subagent.has(entryName),
        });
      }
    }

    const capabilityAgentIds = CAPABILITY_AGENTS.map(({ id }) => id);
    const managedMcpServers = yield* collectManagedAgentMcpServers({
      workspaceRoot: args.workspaceRoot,
      nativeDirectoryInputs: args.nativeDirectoryInputs,
      scope: args.scope,
      agentIds: capabilityAgentIds,
      expectedOwnershipByName: args.expectedMcpEntries,
    }).pipe(Effect.catch(() => Effect.succeed([])));
    const mcpGroups = new Map<
      string,
      {
        readonly path: string;
        readonly name: string;
        readonly claimants: Set<string>;
        readonly ownership: "owned" | "unowned";
      }
    >();
    for (const server of managedMcpServers) {
      const key = `${server.absolutePath}\u0000${server.serverName}`;
      const group = mcpGroups.get(key) ?? {
        path: server.absolutePath,
        name: server.serverName,
        claimants: new Set<string>(),
        ownership: server.ownership,
      };
      group.claimants.add(server.agentId);
      mcpGroups.set(key, group);
    }
    for (const group of mcpGroups.values()) {
      const claimants = [...group.claimants].sort();
      outputs.push({
        extensionType: "mcp-server",
        containerPath: group.path,
        path: `${group.path}#${group.name}`,
        entryName: group.name,
        claimantAgentIds: claimants,
        ownership: group.ownership,
        ...(group.ownership === "owned" ? { proof: "managed-mcp-entry" as const } : {}),
        desired:
          containerIsDesired(claimants, args.desiredAgentIds) &&
          args.expectedNames["mcp-server"].has(group.name),
      });
    }

    const hookContainers = new Map<
      string,
      { readonly path: string; readonly settingsKey: string; readonly claimants: Set<string> }
    >();
    for (const agent of CAPABILITY_AGENTS) {
      const native = agent.capabilities.hook.native;
      if (!("locations" in native)) continue;
      const declarations: ReadonlyArray<NativeConfigReadLocation> = native.locations;
      for (const file of declarations.filter(
        (candidate) =>
          candidate.scope === args.scope &&
          (candidate.format === "json" || candidate.format === "jsonc"),
      )) {
        const settingsKey = file.keyPath?.[0];
        if (file.keyPath?.length !== 1 || settingsKey === undefined) continue;
        const location = resolveNativeReadLocation(
          path,
          agent.id,
          file,
          args,
          args.nativeDirectoryInputs,
        );
        if (location === undefined) continue;
        const resolved = yield* resolveNativeReferent(location.path).pipe(Effect.option);
        if (Option.isNone(resolved)) continue;
        const configPath = resolved.value;
        const key = `${configPath}\u0000${settingsKey}`;
        const group = hookContainers.get(key) ?? {
          path: configPath,
          settingsKey,
          claimants: new Set<string>(),
        };
        group.claimants.add(agent.id);
        hookContainers.set(key, group);
      }
    }
    for (const group of hookContainers.values()) {
      const exists = yield* fs.exists(group.path).pipe(Effect.catch(() => Effect.succeed(false)));
      if (!exists) continue;
      const raw = yield* safeReadFileString(fs, group.path);
      const claimants = [...group.claimants].sort();
      const units = yield* readManagedHookUnits(
        group.path,
        group.settingsKey,
        raw,
        args.expectedHooks,
      ).pipe(Effect.catch(() => Effect.succeed([])));
      for (const unit of units) {
        outputs.push({
          extensionType: "hook",
          containerPath: group.path,
          path: `${group.path}#${unit.name}`,
          entryName: unit.name,
          claimantAgentIds: claimants,
          ownership: "owned",
          proof: "managed-hook-group",
          desired:
            containerIsDesired(claimants, args.desiredAgentIds) &&
            args.expectedNames.hook.has(unit.name),
        });
      }
      const ambiguous = yield* readAmbiguousHookCommands(
        group.path,
        group.settingsKey,
        raw,
        args.expectedHooks,
      ).pipe(Effect.catch(() => Effect.succeed([])));
      for (const command of ambiguous) {
        outputs.push({
          extensionType: "hook",
          containerPath: group.path,
          path: group.path,
          entryName: command,
          claimantAgentIds: claimants,
          ownership: "unowned",
          desired: false,
        });
      }
    }

    return {
      outputs,
      ownedResidue: outputs.filter((output) => output.ownership === "owned" && !output.desired),
      unownedFootprints: outputs.filter((output) => output.ownership === "unowned"),
    };
  });

/**
 * The ownership problems a workspace's agent-native outputs present, with no
 * expectation of what should be there.
 *
 * Reporting ownership is a different question from reconciling it: the
 * reporter must not need a desired graph, because the workspaces most in need
 * of the answer are the ones whose desired state cannot be resolved. Every
 * expected-name set is therefore empty, and the answer is only about proof —
 * a file that sits where AXM writes but carries no ownership marker, and a
 * hook command pointed at an AXM canonical path without one.
 */
export const observeWorkspaceOwnershipIssues = (args: {
  readonly workspaceRoot: string;
  readonly nativeDirectoryInputs: NativeDirectoryInputs;
  readonly scope: WorkspaceScope;
  readonly configuredAgentIds: ReadonlySet<string>;
  readonly expectedHooks: ReadonlyArray<HookOwnership>;
  readonly expectedMcpEntries: Readonly<Record<string, ReadonlyArray<AxmMcpMetadata>>>;
  readonly expectedSkillSources: ObserveAgentOutputsArgs["expectedSkillSources"];
  readonly expectedSubagentFiles: ObserveAgentOutputsArgs["expectedSubagentFiles"];
  readonly authoredSkills: ObserveAgentOutputsArgs["authoredSkills"];
}): Effect.Effect<
  ReadonlyArray<WorkspaceOwnershipIssue>,
  Config.ConfigError,
  CodingAgentRepository | FileSystem.FileSystem | Path.Path
> =>
  observeAgentOutputs({
    workspaceRoot: args.workspaceRoot,
    nativeDirectoryInputs: args.nativeDirectoryInputs,
    scope: args.scope,
    desiredAgentIds: args.configuredAgentIds,
    expectedNames: {
      skill: new Set<string>(),
      subagent: new Set<string>(),
      "mcp-server": new Set<string>(),
      hook: new Set<string>(),
    },
    expectedHooks: args.expectedHooks,
    expectedMcpEntries: args.expectedMcpEntries,
    expectedSkillSources: args.expectedSkillSources,
    expectedSubagentFiles: args.expectedSubagentFiles,
    authoredSkills: args.authoredSkills,
  }).pipe(
    Effect.map((observed) =>
      observed.unownedFootprints.map((output) => ({
        kind:
          output.extensionType === "hook"
            ? ("hook-ownership-ambiguous" as const)
            : ("managed-file-unowned" as const),
        path: output.path,
        detail:
          output.extensionType === "hook"
            ? `Hook command targets an AXM-managed extension path without x-axm ownership metadata: ${output.entryName}`
            : `Agent ${output.extensionType} artifact has no AXM ownership proof.`,
      })),
    ),
  );
