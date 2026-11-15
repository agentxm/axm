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
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { readFileStringIfPresent } from "@agentxm/host-primitives";
import {
  captureNativeLocationSet,
  resolveNativeEntry,
  resolveNativeReferent,
  readCopiedDirectory,
  resolveNativeReadLocation,
  type NativeDirectoryInputs,
  type OwnershipUnitAddress,
  type NativeEntryAddress,
  type NativeLocationSet,
  NativeLocationError,
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
  type WorkspaceOwnershipIssue,
} from "./managed-file-discovery.js";
import { collectNativeAgentMcpServers } from "./mcps/inspection.js";
import {
  readDeclaredHookUnits,
  invalidNativeConfig,
  parseNativeConfigRoot,
  type HookNativeDeclaration,
  type NativeConfigObservationDiagnostic,
} from "../agent-adapters/index.js";

export type AgentOutputOwnershipProof =
  | "canonical-source-link"
  | "copied-directory-receipt"
  | "declared-native-path"
  | "effective-native-declaration";

export interface AgentOutputObservation {
  readonly extensionType: PerAgentType;
  readonly containerPath: string;
  readonly path: string;
  readonly entryName: string;
  readonly nativeAddress?: OwnershipUnitAddress;
  /** Physical entry resolution, preserving dangling links and observation failures. */
  readonly nativeEntry?: Result.Result<NativeEntryAddress, NativeLocationError>;
  /** Owning or uniquely expected package identity when its native name differs. */
  readonly extensionName?: string;
  readonly claimantAgentIds: ReadonlyArray<string>;
  readonly ownership: "owned" | "declared" | "unowned";
  readonly proof?: AgentOutputOwnershipProof;
  readonly desired: boolean;
}

export interface AgentOutputInventory {
  readonly diagnostics: ReadonlyArray<NativeConfigObservationDiagnostic>;
  readonly outputs: ReadonlyArray<AgentOutputObservation>;
  readonly ownedResidue: ReadonlyArray<AgentOutputObservation>;
  readonly unownedFootprints: ReadonlyArray<AgentOutputObservation>;
  /**
   * Present only when requested: the skill containers, entries and expected
   * sources this inventory resolved, failures included. It serves the caller's
   * classification of these outputs before its first write and is never write
   * authority.
   */
  readonly skillLocations?: NativeLocationSet;
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
  /** Declared Subagent names; a file of that name in a native container is AXM's. */
  readonly expectedSubagentNames: ReadonlySet<string>;
  /**
   * The layout whose skill authoring folder holds authored packages, and local
   * declarations (including disabled skills) that mark bundled entries.
   */
  readonly authoredSkills: {
    readonly layout: WorkspaceLayout;
    readonly entries: Readonly<Record<string, SkillEntry>>;
  };
  /** Return the skill pass's resolutions as `skillLocations`. */
  readonly retainSkillLocations?: boolean;
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
    const referents: Array<readonly [string, Result.Result<string, NativeLocationError>]> = [];
    for (const container of containers) {
      const resolved = yield* observed.referent(container.path).pipe(Effect.result);
      referents.push([container.path, resolved]);
      const physicalPath = Result.isSuccess(resolved) ? resolved.success : container.path;
      const group = grouped.get(physicalPath) ?? {
        claimants: new Set<string>(),
        sharedPolicy: false,
      };
      if (container.agentId !== undefined) group.claimants.add(container.agentId);
      group.sharedPolicy ||= container.sharedPolicy === true;
      grouped.set(physicalPath, group);
    }
    return {
      referents,
      containers: [...grouped].map(([path, group]) => ({
        path,
        claimantAgentIds: [...group.claimants].sort(),
        sharedPolicy: group.sharedPolicy,
      })),
    };
  });

/**
 * Answer from the resolutions this inventory just made, failures included, so a
 * classification that follows them in the same owner call does not resolve the
 * same paths again. A path the inventory did not resolve resolves live, exactly
 * as a fresh capture would. Never write authority.
 */
const observedNativeLocationSet = (observed: {
  readonly entries: ReadonlyArray<
    readonly [target: string, result: Result.Result<NativeEntryAddress, NativeLocationError>]
  >;
  readonly referents: ReadonlyArray<
    readonly [target: string, result: Result.Result<string, NativeLocationError>]
  >;
}) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const live = yield* Effect.context<FileSystem.FileSystem | Path.Path>();
    const entries = new Map(
      observed.entries.map(([target, result]) => [path.resolve(target), result]),
    );
    const referents = new Map(
      observed.referents.map(([target, result]) => [path.resolve(target), result]),
    );
    return {
      entry: (target) => {
        const key = path.resolve(target);
        const result = entries.get(key);
        return result === undefined
          ? resolveNativeEntry(key).pipe(Effect.provideContext(live))
          : Effect.fromResult(result);
      },
      referent: (target) => {
        const key = path.resolve(target);
        const result = referents.get(key);
        return result === undefined
          ? resolveNativeReferent(key).pipe(Effect.provideContext(live))
          : Effect.fromResult(result);
      },
    } satisfies NativeLocationSet;
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

/** Preserve directory read failures instead of interpreting them as an empty container. */
const readNamedOutputDirectory = (
  container: { readonly path: string; readonly claimantAgentIds: ReadonlyArray<string> },
  extensionType: "skill" | "subagent",
  outputs: Array<AgentOutputObservation>,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const entries = yield* fs.readDirectory(container.path).pipe(Effect.result);
    if (Result.isSuccess(entries)) return entries.success;
    if (entries.failure.reason._tag !== "NotFound") {
      outputs.push({
        extensionType,
        containerPath: container.path,
        path: container.path,
        entryName: "",
        claimantAgentIds: container.claimantAgentIds,
        ownership: "unowned",
        desired: false,
        nativeEntry: Result.fail(
          new NativeLocationError({
            target: container.path,
            reason: "unreadable",
            cause: entries.failure,
          }),
        ),
      });
    }
    return [];
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
    const diagnostics: Array<NativeConfigObservationDiagnostic> = [];
    const expectedSkillSources: Array<{ packageName: string; source: string; nativeName: string }> =
      [];
    const skillReferents: Array<readonly [string, Result.Result<string, NativeLocationError>]> = [];
    const skillEntries: Array<
      readonly [string, Result.Result<NativeEntryAddress, NativeLocationError>]
    > = [];
    for (const [packageName, sources] of Object.entries(args.expectedSkillSources)) {
      for (const source of sources) {
        const physical = yield* resolveNativeReferent(source).pipe(Effect.result);
        skillReferents.push([source, physical]);
        const nativeName = yield* readSkillDirectoryName(source, packageName).pipe(Effect.option);
        if (Result.isFailure(physical) || Option.isNone(nativeName)) continue;
        expectedSkillSources.push({
          packageName,
          source: physical.success,
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

    const skillGroups = yield* groupContainers([
      { path: path.join(args.workspaceRoot, ".agents/skills"), sharedPolicy: true },
      ...skillContainers,
    ]);
    skillReferents.push(...skillGroups.referents);
    for (const container of skillGroups.containers) {
      const desiredContainer =
        container.sharedPolicy ||
        containerIsDesired(container.claimantAgentIds, args.desiredAgentIds);
      for (const entry of yield* readNamedOutputDirectory(container, "skill", outputs)) {
        const artifactPath = path.join(container.path, entry);
        const nativeEntry = yield* resolveNativeEntry(artifactPath).pipe(Effect.result);
        skillEntries.push([artifactPath, nativeEntry]);
        if (Result.isSuccess(nativeEntry) && nativeEntry.success.kind === "absent") continue;
        const address = Result.isSuccess(nativeEntry)
          ? Option.some(nativeEntry.success)
          : Option.none();
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
          nativeEntry,
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

    for (const container of (yield* groupContainers(subagentContainers)).containers) {
      const desiredContainer = containerIsDesired(container.claimantAgentIds, args.desiredAgentIds);
      for (const entry of yield* readNamedOutputDirectory(container, "subagent", outputs)) {
        const artifactPath = path.join(container.path, entry);
        const nativeEntry = yield* resolveNativeEntry(artifactPath).pipe(Effect.result);
        if (Result.isSuccess(nativeEntry)) {
          const entry = nativeEntry.success;
          if (entry.kind === "absent" || entry.kind === "directory" || entry.kind === "other")
            continue;
          if (entry.referentPath !== undefined) {
            const stat = yield* fs.stat(artifactPath).pipe(Effect.option);
            if (Option.isSome(stat) && stat.value.type !== "File") continue;
          }
        }
        // Ownership remains the declaration at its native path. Health does not confer ownership.
        const entryName = extensionNameFromFilename(entry);
        const managed = args.expectedSubagentNames.has(entryName);
        const outputPath = Result.isSuccess(nativeEntry)
          ? (nativeEntry.success.referentPath ?? nativeEntry.success.entryPath)
          : artifactPath;
        outputs.push({
          extensionType: "subagent",
          containerPath: container.path,
          path: outputPath,
          nativeEntry,
          entryName,
          claimantAgentIds: container.claimantAgentIds,
          ownership: managed ? "owned" : "unowned",
          ...(managed ? { proof: "declared-native-path" } : {}),
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
    });
    diagnostics.push(...managedMcpServers.diagnostics);
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
    for (const server of managedMcpServers.servers) {
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
      {
        readonly path: string;
        readonly settingsKey: string;
        readonly claimants: Set<string>;
        readonly aliases: Set<string>;
        readonly resolutionFailure?: NativeLocationError;
      }
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
      const resolved = yield* observedHooks.referent(location.path).pipe(Effect.result);
      const configPath = Result.isSuccess(resolved) ? resolved.success : location.path;
      const key = `${configPath}\u0000${settingsKey}`;
      const group = hookContainers.get(key) ?? {
        path: configPath,
        settingsKey,
        claimants: new Set<string>(),
        aliases: new Set<string>(),
        ...(Result.isFailure(resolved) ? { resolutionFailure: resolved.failure } : {}),
      };
      group.claimants.add(agentId);
      group.aliases.add(location.path);
      hookContainers.set(key, group);
    }
    for (const group of hookContainers.values()) {
      const claimants = [...group.claimants].sort();
      const diagnostic = {
        extensionType: "hook" as const,
        address: {
          kind: "key-path" as const,
          path: group.path,
          keys: [group.settingsKey] as const,
        },
        aliases: [...group.aliases].sort(),
        claimantAgentIds: claimants,
      };
      if (group.resolutionFailure !== undefined) {
        diagnostics.push({ ...diagnostic, stage: "resolve", cause: group.resolutionFailure });
        continue;
      }
      const content = yield* readFileStringIfPresent(fs, group.path).pipe(Effect.result);
      if (Result.isFailure(content)) {
        diagnostics.push({ ...diagnostic, stage: "read", cause: content.failure });
        continue;
      }
      if (Option.isNone(content.success)) continue;
      const raw = content.success.value;
      const units = yield* readDeclaredHookUnits(
        group.path,
        group.settingsKey,
        raw,
        args.expectedHooks,
      ).pipe(Effect.result);
      if (Result.isFailure(units)) {
        diagnostics.push({ ...diagnostic, stage: "decode", cause: units.failure });
        continue;
      }
      if (units.success.length === 0) {
        const document = yield* parseNativeConfigRoot({
          format: "jsonc",
          raw,
          onFailure: invalidNativeConfig("jsonc", group.path),
        }).pipe(Effect.result);
        if (Result.isFailure(document)) {
          diagnostics.push({ ...diagnostic, stage: "decode", cause: document.failure });
          continue;
        }
        const registrations = document.success[group.settingsKey];
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
      for (const unit of units.success) {
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
      diagnostics,
      outputs,
      ownedResidue: outputs.filter((output) => output.ownership === "owned" && !output.desired),
      unownedFootprints: outputs.filter((output) => output.ownership === "unowned"),
      ...(args.retainSkillLocations === true
        ? {
            skillLocations: yield* observedNativeLocationSet({
              entries: skillEntries,
              referents: skillReferents,
            }),
          }
        : {}),
    };
  });

/**
 * The ownership problems an agent-output inventory presents.
 *
 * Reporting ownership is a different question from reconciling it: the
 * reporter must not need a desired graph, because the workspaces most in need
 * of the answer are the ones whose desired state cannot be resolved. The
 * answer is therefore only about proof — file artifacts that lack their
 * required ownership evidence — and an inventory's ownership never depends on
 * its desired agents or expected names, so any inventory of the workspace
 * taken with the same ownership authority answers it. Native MCP and Hook
 * declarations follow declaration authority instead.
 */
export const workspaceOwnershipIssues = (
  inventory: AgentOutputInventory,
): ReadonlyArray<WorkspaceOwnershipIssue> =>
  Object.freeze(
    inventory.unownedFootprints
      .filter((output) => output.extensionType !== "mcp-server" && output.extensionType !== "hook")
      .map((output) =>
        Object.freeze({
          kind: "managed-file-unowned" as const,
          path: output.path,
          detail:
            output.extensionType === "subagent"
              ? "Agent subagent file is not a declared Subagent at this path."
              : `Agent ${output.extensionType} artifact has no AXM ownership proof.`,
        }),
      ),
  );
