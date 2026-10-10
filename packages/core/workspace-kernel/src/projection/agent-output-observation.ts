import { readSkillDirectoryName } from "../workspace-state/index.js";
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
  captureNativeLocationSet,
  resolveNativeEntry,
  resolveNativeReferent,
  readCopiedDirectory,
  resolveNativeReadLocation,
  type NativeDirectoryInputs,
  type OwnershipUnitAddress,
} from "../locations/index.js";
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
import { collectNativeAgentMcpServers } from "./mcps/inspection.js";
import {
  readDeclaredHookUnits,
  parseNativeConfigRoot,
  type HookNativeDeclaration,
} from "../agent-adapters/index.js";

export type AgentOutputOwnershipProof =
  | "canonical-source-link"
  | "copied-directory-receipt"
  | "managed-banner"
  | "effective-native-declaration";

export interface AgentOutputObservation {
  readonly extensionType: PerAgentType;
  readonly containerPath: string;
  readonly path: string;
  readonly entryName: string;
  readonly nativeAddress?: OwnershipUnitAddress;
  /** Owning or uniquely expected package identity when its native name differs. */
  readonly extensionName?: string;
  readonly claimantAgentIds: ReadonlyArray<string>;
  readonly ownership: "owned" | "declared" | "unowned";
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
  readonly expectedHooks: ReadonlyArray<HookNativeDeclaration>;
  readonly declaredMcpNames: ReadonlySet<string>;
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
    const observed = yield* captureNativeLocationSet({
      referents: containers.map((container) => container.path),
    });
    for (const container of containers) {
      const resolved = yield* observed.referent(container.path).pipe(Effect.option);
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
    const expectedSkillSources: Array<{ packageName: string; source: string; nativeName: string }> =
      [];
    for (const [packageName, sources] of Object.entries(args.expectedSkillSources)) {
      for (const source of sources) {
        const physical = yield* resolveNativeReferent(source).pipe(Effect.option);
        const nativeName = yield* readSkillDirectoryName(source, packageName).pipe(Effect.option);
        if (Option.isNone(physical) || Option.isNone(nativeName)) continue;
        expectedSkillSources.push({
          packageName,
          source: physical.value,
          nativeName: nativeName.value,
        });
      }
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
        const candidates = expectedSkillSources.filter(
          (candidate) => candidate.nativeName === entry,
        );
        const packageNames = new Set(candidates.map((candidate) => candidate.packageName));
        let extensionName = packageNames.size === 1 ? candidates[0]?.packageName : undefined;
        const extensionType: PerAgentType = "skill";
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
            expectedSkillSources.some((candidate) => candidate.source === immediate.value.entryPath)
          ) {
            proof = "canonical-source-link";
            extensionName = expectedSkillSources.find(
              (candidate) => candidate.source === immediate.value.entryPath,
            )?.packageName;
          }
        } else if (Option.isSome(address) && address.value.kind === "directory") {
          if (yield* isAuthoredSkillPackage(args.authoredSkills, artifactPath, entry)) continue;
          const receipt = yield* readCopiedDirectory(artifactPath);
          if (Option.isSome(receipt)) {
            if (
              expectedSkillSources.some((candidate) => candidate.source === receipt.value.source)
            ) {
              proof = "copied-directory-receipt";
              extensionName = expectedSkillSources.find(
                (candidate) => candidate.source === receipt.value.source,
              )?.packageName;
            }
          }
        }
        outputs.push({
          extensionType,
          containerPath: container.path,
          path: artifactPath,
          entryName: entry,
          ...(extensionName === undefined ? {} : { extensionName }),
          claimantAgentIds: container.claimantAgentIds,
          ownership: proof === undefined ? "unowned" : "owned",
          ...(proof === undefined ? {} : { proof }),
          desired:
            (extensionType === "skill"
              ? desiredContainer
              : containerIsDesired(container.claimantAgentIds, args.desiredAgentIds)) &&
            args.expectedNames[extensionType].has(extensionName ?? entry) &&
            candidates.some((candidate) => candidate.packageName === extensionName),
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
        const format = managedFileFormatForPath(artifactPath);
        const marker = format === undefined ? Option.none() : managedFileMarker(content, format);
        const packageOwner = Option.isNone(marker)
          ? undefined
          : Object.entries(args.expectedSubagentFiles).find(([, proofs]) =>
              proofs.some(
                (proof) => marker.value.ext === proof.ext && marker.value.src === proof.src,
              ),
            );
        const entryName = packageOwner?.[0] ?? extensionNameFromFilename(entry);
        const expected = packageOwner?.[1] ?? [];
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
    const managedMcpServers = yield* collectNativeAgentMcpServers({
      workspaceRoot: args.workspaceRoot,
      nativeDirectoryInputs: args.nativeDirectoryInputs,
      scope: args.scope,
      agentIds: capabilityAgentIds,
      declaredMcpNames: args.declaredMcpNames,
    }).pipe(Effect.catch(() => Effect.succeed([])));
    const mcpGroups = new Map<
      string,
      {
        readonly path: string;
        readonly name: string;
        readonly keys: readonly [string, ...string[]];
        readonly claimants: Set<string>;
        readonly ownership: "owned" | "declared" | "unowned";
      }
    >();
    for (const server of managedMcpServers) {
      const key = JSON.stringify([server.absolutePath, server.keyPath]);
      const group = mcpGroups.get(key) ?? {
        path: server.absolutePath,
        name: server.serverName,
        keys: server.keyPath,
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
        nativeAddress: { kind: "key-path", path: group.path, keys: group.keys },
        claimantAgentIds: claimants,
        ownership: group.ownership,
        ...(group.ownership === "declared"
          ? { proof: "effective-native-declaration" as const }
          : {}),
        desired:
          containerIsDesired(claimants, args.desiredAgentIds) &&
          args.expectedNames["mcp-server"].has(group.name),
      });
    }

    const hookContainers = new Map<
      string,
      { readonly path: string; readonly settingsKey: string; readonly claimants: Set<string> }
    >();
    const hookReaders = CAPABILITY_AGENTS.flatMap((agent) => {
      const native = agent.capabilities.hook.native;
      if (!("locations" in native)) return [];
      const declarations: ReadonlyArray<NativeConfigReadLocation> = native.locations;
      return declarations
        .filter(
          (candidate) =>
            candidate.scope === args.scope &&
            (candidate.format === "json" || candidate.format === "jsonc"),
        )
        .flatMap((file) => {
          const settingsKey = file.keyPath?.[0];
          if (file.keyPath?.length !== 1 || settingsKey === undefined) return [];
          const location = resolveNativeReadLocation(
            path,
            agent.id,
            file,
            args,
            args.nativeDirectoryInputs,
          );
          return location === undefined ? [] : [{ agentId: agent.id, settingsKey, location }];
        });
    });
    const observedHooks = yield* captureNativeLocationSet({
      referents: hookReaders.map((reader) => reader.location.path),
    });
    for (const { agentId, settingsKey, location } of hookReaders) {
      const resolved = yield* observedHooks.referent(location.path).pipe(Effect.option);
      if (Option.isNone(resolved)) continue;
      const configPath = resolved.value;
      const key = `${configPath}\u0000${settingsKey}`;
      const group = hookContainers.get(key) ?? {
        path: configPath,
        settingsKey,
        claimants: new Set<string>(),
      };
      group.claimants.add(agentId);
      hookContainers.set(key, group);
    }
    for (const group of hookContainers.values()) {
      const exists = yield* fs.exists(group.path).pipe(Effect.catch(() => Effect.succeed(false)));
      if (!exists) continue;
      const raw = yield* safeReadFileString(fs, group.path);
      const claimants = [...group.claimants].sort();
      const units = yield* readDeclaredHookUnits(
        group.path,
        group.settingsKey,
        raw,
        args.expectedHooks,
      ).pipe(Effect.catch(() => Effect.succeed([])));
      if (units.length === 0) {
        const document = yield* parseNativeConfigRoot({
          format: "jsonc",
          configPath: group.path,
          raw,
        }).pipe(Effect.option);
        const registrations = Option.isSome(document)
          ? document.value[group.settingsKey]
          : undefined;
        if (
          typeof registrations === "object" &&
          registrations !== null &&
          Object.values(registrations).some((value) => Array.isArray(value) && value.length > 0)
        )
          outputs.push({
            extensionType: "hook",
            containerPath: group.path,
            path: `${group.path}#${group.settingsKey}`,
            entryName: group.settingsKey,
            nativeAddress: { kind: "key-path", path: group.path, keys: [group.settingsKey] },
            claimantAgentIds: claimants,
            ownership: "unowned",
            desired: false,
          });
      }
      for (const unit of units) {
        const declaration = args.expectedHooks.find(({ name }) => name === unit.name);
        if (declaration === undefined) continue;
        outputs.push({
          extensionType: "hook",
          containerPath: group.path,
          path: `${group.path}#${unit.name}`,
          entryName: unit.name,
          nativeAddress: {
            kind: "hook-registrations",
            path: group.path,
            settingsKey: group.settingsKey,
            scriptRoots: [declaration.root],
          },
          claimantAgentIds: claimants,
          ownership: "declared",
          proof: "effective-native-declaration",
          desired:
            containerIsDesired(claimants, args.desiredAgentIds) &&
            args.expectedNames.hook.has(unit.name),
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
 * file artifacts that lack their required ownership evidence. Native MCP
 * and Hook declarations do not use file ownership markers.
 */
export const observeWorkspaceOwnershipIssues = (args: {
  readonly workspaceRoot: string;
  readonly nativeDirectoryInputs: NativeDirectoryInputs;
  readonly scope: WorkspaceScope;
  readonly configuredAgentIds: ReadonlySet<string>;
  readonly expectedHooks: ReadonlyArray<HookNativeDeclaration>;
  readonly declaredMcpNames: ReadonlySet<string>;
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
    declaredMcpNames: args.declaredMcpNames,
    expectedSkillSources: args.expectedSkillSources,
    expectedSubagentFiles: args.expectedSubagentFiles,
    authoredSkills: args.authoredSkills,
  }).pipe(
    Effect.map((observed) =>
      observed.unownedFootprints
        .filter(
          (output) => output.extensionType !== "mcp-server" && output.extensionType !== "hook",
        )
        .map((output) => ({
          kind: "managed-file-unowned" as const,
          path: output.path,
          detail: `Agent ${output.extensionType} artifact has no AXM ownership proof.`,
        })),
    ),
  );
