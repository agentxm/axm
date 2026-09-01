/**
 * WorkspaceMutations mutation service tag and interface.
 *
 * Defines the `WorkspaceMutations` service tag and `WorkspaceMutationsService`
 * interface. Use `WorkspaceReadModel` for read-only scoped projections; this
 * facade owns workspace mutations.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import type * as Option from "effect/Option";
import type * as Path from "effect/Path";
import type * as Scope from "effect/Scope";
import * as ServiceMap from "effect/Context";

import type {
  TransitionContention,
  TransitionLockHolder,
  WorkspaceRestorationIncomplete,
  WorkspaceSnapshotError,
  WorkspaceTransactionFailure,
  WorkspaceTransitionAcquireFailure,
} from "./transaction.js";
import type {
  LockfileReadError,
  SettingsReadError,
  WorkspaceRootEscape,
} from "./read-model/errors.js";
import type { SettingsWriteError } from "../settings/errors.js";
import type { LockfileValidationError, LockfileWriteError } from "../lockfile/errors.js";
import type {
  DesiredPackGraphIncomplete,
  InvalidAgentId,
  LockedSkillMissing,
  SettingsEntryMissing,
  WorkspaceLayoutError,
  WorkspaceNotInitialized,
} from "./errors.js";
import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import type { ExtensionVisibility } from "@agentxm/extension-model/unstable/extensions/common";
import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import type {
  RegistryPackLockEntry,
  HookLockEntry,
  HooksLockMap,
  KnowledgeLockEntry,
  KnowledgeLockMap,
  McpServerLockEntry,
  McpServersLockMap,
  PackLockEntry,
  PacksLockMap,
  RuleLockEntry,
  RulesLockMap,
  SkillLockEntry,
  SkillsLockMap,
  SubagentLockEntry,
  SubagentsLockMap,
} from "../lockfile/index.js";
import type {
  HookEntry,
  HooksMap,
  KnowledgeEntry,
  KnowledgeMap,
  InstructionsConfigValue,
  McpServerEntry,
  McpServersMap,
  MinimumReleaseAge,
  PackEntry,
  PacksMap,
  RuleEntry,
  RulesMap,
  SkillEntry,
  SkillsMap,
  SubagentEntry,
  SubagentsMap,
  SourceHostConfig,
} from "../settings/index.js";
import type { ScopedReleaseAgeExcludePattern } from "@agentxm/extension-model/unstable/extensions/release-age";
import type { ReadModelRecordRow } from "./read-model-record-types.js";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import type { ExtensionInventory } from "./read-model/extensions/inventory.js";
import type { ResolvedKnowledgeDiscoveryConfig } from "../knowledge/discovery-config.js";
import type { DesiredStateGraph, ProspectivePackRef } from "./desired-state-graph.js";
import type { AbsolutePath } from "@agentxm/extension-model/unstable/path-types";
import type { ConfigurableAgentId } from "@agentxm/extension-model/unstable/agent-capabilities";
import type { WorkspaceLayout } from "./layout.js";
import type { ExtensionPathSource } from "./extension-paths.js";

// ---------------------------------------------------------------------------
// CLI-specific types (inlined to avoid circular dependency with CLI)
// ---------------------------------------------------------------------------

/**
 * Minimal structural discriminant for determining skill path layout.
 *
 * Registry refs carry an owner for the canonical path; all other ref types
 * use the shared external extensions directory.
 */
export type SkillPathSource = ExtensionPathSource;

/**
 * Computed paths for an installed skill directory.
 */
export interface SkillDirPaths {
  readonly canonicalPath: string;
  readonly skillSrcPath: string;
}

/**
 * Computed path for an installed pack directory.
 */
export interface PackDirPath {
  readonly canonicalPath: string;
}

export interface SkillExtensionTarget {
  readonly type: "skill";
  readonly name: string;
}

export interface PackExtensionTarget {
  readonly type: "pack";
  readonly name: string;
  readonly owner: Handle;
}

export interface McpServerExtensionTarget {
  readonly type: "mcp-server";
  readonly name: string;
}

export interface SubagentExtensionTarget {
  readonly type: "subagent";
  readonly name: string;
}

export interface RuleExtensionTarget {
  readonly type: "rule";
  readonly name: string;
}

export interface HookExtensionTarget {
  readonly type: "hook";
  readonly name: string;
}

export interface KnowledgeExtensionTarget {
  readonly type: "knowledge";
  readonly name: string;
}

/**
 * Identifies a specific extension by type and name.
 */
export type ExtensionTarget =
  | SkillExtensionTarget
  | PackExtensionTarget
  | McpServerExtensionTarget
  | SubagentExtensionTarget
  | RuleExtensionTarget
  | HookExtensionTarget
  | KnowledgeExtensionTarget;

/**
 * Maps an ExtensionRef type to its corresponding ExtensionTarget type.
 */
export type ExtensionTargetFor<TRef extends ExtensionRef> = Extract<
  ExtensionTarget,
  { readonly type: TRef["type"] }
>;

/** Lockfile health state used for reconciliation decisions. */
export type LockfileState = "ok" | "missing" | "invalid";

// ---------------------------------------------------------------------------
// Failure unions
// ---------------------------------------------------------------------------

/** Scoped settings read through the read model. */
export type WorkspaceSettingsReadFailure = SettingsReadError | WorkspaceRootEscape;

/** Scoped lockfile read through the read model. */
export type WorkspaceLockfileReadFailure = LockfileReadError | WorkspaceRootEscape;

/** Any scoped workspace-state read. */
export type WorkspaceStateReadFailure = SettingsReadError | LockfileReadError | WorkspaceRootEscape;

/**
 * Settings read-modify-write, including the transaction path-protection
 * preimage taken before the first mutation.
 */
export type WorkspaceSettingsMutationFailure =
  WorkspaceSettingsReadFailure | SettingsWriteError | WorkspaceSnapshotError;

/** Lockfile read-modify-write through the snapshot-commit path. */
export type WorkspaceLockfileMutationFailure =
  WorkspaceLockfileReadFailure | LockfileValidationError | LockfileWriteError;

/** Coupled settings-and-lockfile mutation. */
export type WorkspaceStateMutationFailure =
  WorkspaceSettingsMutationFailure | WorkspaceLockfileMutationFailure;

export interface WorkspaceLifecycleTransactionArgs<A, E = never, R = never> {
  readonly targets?: ReadonlyArray<string>;
  readonly transition: Effect.Effect<A, E, R>;
  readonly validate: (value: A) => Effect.Effect<void, E, R>;
  /** Observes the start of rollback restoration; never controls it. */
  readonly onRestorationStarted?: Effect.Effect<void>;
  /**
   * When `false`, the transaction does not claim the shared settings and
   * lockfile targets up front. A closure-scoped plan apply passes `false`:
   * each closure protects the shared files at its own first touch, so a
   * closure's rollback restores only its own delta and never tears an
   * earlier closure's settled commit out of the shared files. Defaults to
   * `true` — a direct transaction is one closure and claims them itself.
   */
  readonly claimDefaultTargets?: boolean;
}

export type WorkspaceTransactionRunner = <A, E = never, R = never>(
  args: WorkspaceLifecycleTransactionArgs<A, E, R>,
) => Effect.Effect<A, WorkspaceTransactionFailure | WorkspaceRestorationIncomplete | E, R>;

/** What a post-confirmation apply records as the workspace transition holder. */
export interface WorkspaceTransitionRequest {
  readonly command: string;
  readonly candidateId?: string;
  /** Called once when the invocation starts waiting on another holder. */
  readonly onWaiting?: (holder: Option.Option<TransitionLockHolder>) => Effect.Effect<void>;
}

/**
 * Acquire the workspace transition for the calling scope's lifetime. Resolves
 * `None` when acquired (release is a scope finalizer) and `Some(contention)`
 * when the wait bound elapsed while another invocation held it.
 */
export type WorkspaceTransitionAcquirer = (
  request: WorkspaceTransitionRequest,
) => Effect.Effect<
  Option.Option<TransitionContention>,
  WorkspaceTransitionAcquireFailure,
  Scope.Scope
>;

// ---------------------------------------------------------------------------
// Transaction capabilities (implemented by workspace operations)
// ---------------------------------------------------------------------------

/**
 * The two operations-side capabilities the workspace mutation facade
 * receives by injection: the transaction runner and the transition acquirer.
 */
export interface WorkspaceTransactionCapabilities {
  readonly runTransaction: WorkspaceTransactionRunner;
  readonly acquireTransition: WorkspaceTransitionAcquirer;
}

/** Workspace paths the capability closures are anchored to. */
export interface WorkspaceTransactionCapabilityArgs {
  readonly workspaceDir: string;
  readonly settingsPath: string;
  readonly lockPath: string;
}

/**
 * Builds the injected capabilities for one workspace-service instance. The
 * facade calls this once with its resolved paths; the implementation owns
 * transaction admission and eliminates FileSystem/Path from the members.
 */
export type MakeWorkspaceTransactionCapabilities = (
  args: WorkspaceTransactionCapabilityArgs,
) => Effect.Effect<WorkspaceTransactionCapabilities, never, FileSystem.FileSystem | Path.Path>;

export interface WorkspaceReadModelRecords {
  /** Deterministic inventory across every installable extension type or one selected type. */
  readonly getInventory: (options: {
    readonly type?: InstallableExtensionType;
  }) => Effect.Effect<ExtensionInventory, WorkspaceStateReadFailure>;
  /** Read-only physical inventory for one extension type. */
  readonly getExtensionInventory: (
    type: InstallableExtensionType,
    options: {
      readonly agents?: ReadonlyArray<string>;
    },
  ) => Effect.Effect<ExtensionInventory, WorkspaceStateReadFailure>;
  /**
   * Every read-model row for one extension type, tagged with its lifecycle
   * (`configured` / `implicit` / `unmanaged`).
   *
   * Total over `InstallableExtensionType` and non-throwing: a type whose
   * workspace has no entries yields an empty array. Narrow with the helpers in
   * `read-model-record-rows.ts` rather than adding a per-type accessor.
   */
  readonly rows: (
    type: InstallableExtensionType,
  ) => Effect.Effect<ReadonlyArray<ReadModelRecordRow>, WorkspaceStateReadFailure>;
}

// ---------------------------------------------------------------------------
// Args types
// ---------------------------------------------------------------------------

/**
 * Arguments for `setSkill` -- bundles the skill name (map key) with the lock entry.
 * The name may diverge from any registry extension name.
 */
export interface SetSkillArgs {
  readonly name: string;
  readonly lockEntry: SkillLockEntry;
  /** Version constraint from the original source (e.g. "^1.0.0"). Preserved in settings, not in lockfile. */
  readonly versionRange: Option.Option<string>;
}

/**
 * Arguments for `setPack` -- all `PackLockEntry` fields except `type` (always "registry"),
 * plus an optional version constraint for settings persistence.
 */
export type SetPackArgs = RegistryPackLockEntry & {
  /** Version constraint from the original source (e.g. "^2.0.0"). Preserved in settings, not in lockfile. */
  readonly versionRange: Option.Option<string>;
};

/**
 * Arguments for `setSubagent` -- bundles the subagent name with the lock entry.
 */
export interface SetSubagentArgs {
  readonly name: string;
  readonly lockEntry: SubagentLockEntry;
  readonly versionRange: Option.Option<string>;
}

/**
 * Arguments for `setMcpServer` -- bundles the MCP server name with the lock entry.
 */
export interface SetMcpServerArgs {
  readonly name: string;
  readonly lockEntry: McpServerLockEntry;
  readonly versionRange: Option.Option<string>;
  readonly env?: Readonly<Record<string, string>>;
  readonly enabled?: boolean;
  readonly agents?: ReadonlyArray<ConfigurableAgentId>;
}

/**
 * Arguments for `setRule` -- bundles the rule name with the lock entry.
 */
export interface SetRuleArgs {
  readonly name: string;
  readonly lockEntry: RuleLockEntry;
  readonly versionRange: Option.Option<string>;
}

/**
 * Arguments for `setHook` -- bundles the hook name with the lock entry.
 */
export interface SetHookArgs {
  readonly name: string;
  readonly lockEntry: HookLockEntry;
  readonly versionRange: Option.Option<string>;
}

export interface SetKnowledgeArgs {
  readonly name: string;
  readonly lockEntry: KnowledgeLockEntry;
  readonly versionRange: Option.Option<string>;
}

// ---------------------------------------------------------------------------
// Service interface
// ---------------------------------------------------------------------------

/**
 * WorkspaceMutations mutation service interface.
 *
 * Gateway for settings, lockfile, and materialized workspace mutations.
 * Read-only callers should prefer `WorkspaceReadModel` projections.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface WorkspaceMutationsService {
  /** Whether this is the user workspace or a project workspace. */
  readonly scope: WorkspaceScope;
  /** Path to the scope's runtime `.axm` directory. */
  readonly path: string;
  /** User home or project root that anchors scope resolution. */
  readonly baseDir: string;
  /** Explicit scope-aware paths for authoritative, runtime, and package state. */
  readonly layout: WorkspaceLayout;
  /** Run one coupled authoritative workspace transition under the workspace lock. */
  readonly runTransaction: WorkspaceTransactionRunner;
  /** Acquire the workspace transition for a post-confirmation apply. */
  readonly acquireTransition: WorkspaceTransitionAcquirer;
  /** Probe lockfile state for policy decisions: ok | missing | invalid. */
  readonly getLockfileState: () => Effect.Effect<
    LockfileState,
    LockfileValidationError | WorkspaceRootEscape
  >;
  /** Build desired extension state from settings and installed or prospective Pack manifests. */
  readonly getDesiredStateGraph: (options?: {
    readonly prospectivePacks?: ReadonlyArray<ProspectivePackRef>;
  }) => Effect.Effect<DesiredStateGraph, WorkspaceStateReadFailure>;
  /** Merged sources from project, user-scope, and built-in defaults. Cached per workspace lifetime. */
  readonly getConfiguredSources: () => Effect.Effect<
    ReadonlyArray<SourceHostConfig>,
    WorkspaceSettingsReadFailure
  >;
  /** Lookup a source by name from the merged sources list. */
  readonly getConfiguredSourceByName: (
    name: string,
  ) => Effect.Effect<Option.Option<SourceHostConfig>, WorkspaceSettingsReadFailure>;
  /** Filter merged sources to registry sources. */
  readonly getRegistrySourceHosts: () => Effect.Effect<
    ReadonlyArray<Extract<SourceHostConfig, { type: "registry" }>>,
    WorkspaceSettingsReadFailure
  >;
  readonly records: WorkspaceReadModelRecords;
  /** Resolve owner: project settings -> user-scope settings -> Option.none(). */
  readonly getConfiguredOwner: () => Effect.Effect<
    Option.Option<Handle>,
    WorkspaceSettingsReadFailure
  >;
  /** Repository publication default for this exact workspace scope. */
  readonly getPublishDefaultVisibility: () => Effect.Effect<
    Option.Option<ExtensionVisibility>,
    WorkspaceSettingsReadFailure
  >;
  /** Resolve minimumReleaseAge: project settings -> user-scope settings -> default. */
  readonly getMinimumReleaseAge: () => Effect.Effect<
    MinimumReleaseAge,
    WorkspaceSettingsReadFailure
  >;
  /** Resolve minimumReleaseAgeExclude with the same scope precedence; an explicit [] wins. */
  readonly getMinimumReleaseAgeExclude: () => Effect.Effect<
    ReadonlyArray<ScopedReleaseAgeExcludePattern>,
    WorkspaceSettingsReadFailure
  >;
  /** Append a source to project settings. Invalidates the sources cache. Serialized by semaphore. */
  readonly addConfiguredSource: (
    source: SourceHostConfig,
  ) => Effect.Effect<void, WorkspaceSettingsMutationFailure>;
  /** Read settings and return configured skills, defaulting to `{}`. */
  readonly getConfiguredSkillEntries: () => Effect.Effect<SkillsMap, WorkspaceSettingsReadFailure>;
  /** Read settings and return the configured agent IDs, defaulting to `[]`. */
  readonly getConfiguredAgents: () => Effect.Effect<
    ReadonlyArray<string>,
    WorkspaceSettingsReadFailure
  >;
  /** Read settings and return instruction-file config, defaulting to unset. */
  readonly getInstructionsConfig: () => Effect.Effect<
    Option.Option<InstructionsConfigValue>,
    WorkspaceSettingsReadFailure
  >;
  /** Set instruction-file config. Use false for explicit manual mode. Serialized by semaphore. */
  readonly setInstructionsConfig: (
    config: InstructionsConfigValue,
  ) => Effect.Effect<void, WorkspaceSettingsMutationFailure>;
  /** Read settings and return configured MCP server entries, defaulting to `{}`. */
  readonly getConfiguredMcpServerEntries: () => Effect.Effect<
    McpServersMap,
    WorkspaceSettingsReadFailure
  >;
  /** Read settings and return configured rules, defaulting to `{}`. */
  readonly getConfiguredRuleEntries: () => Effect.Effect<RulesMap, WorkspaceSettingsReadFailure>;
  /** Read lockfile and return the rules lock map. */
  readonly getLockedRules: () => Effect.Effect<RulesLockMap, WorkspaceLockfileReadFailure>;
  /** Read lockfile and return the entry for a specific rule, or Option.none(). */
  readonly getLockedRuleEntry: (
    name: string,
  ) => Effect.Effect<Option.Option<RuleLockEntry>, WorkspaceLockfileReadFailure>;
  /** Update desired rule settings and any external accepted resolution atomically. */
  readonly setRule: (args: SetRuleArgs) => Effect.Effect<void, WorkspaceStateMutationFailure>;
  /** Add or update a rule in lockfile only. Used for pack dependencies. Serialized by semaphore. */
  readonly setRuleLock: (
    args: SetRuleArgs,
  ) => Effect.Effect<void, WorkspaceLockfileMutationFailure>;
  /** Remove a rule from both settings and lockfile. No-op if absent. Serialized by semaphore. */
  readonly removeRule: (name: string) => Effect.Effect<void, WorkspaceStateMutationFailure>;
  /** Remove a rule from settings only. Serialized by semaphore. */
  readonly removeRuleSettings: (
    name: string,
  ) => Effect.Effect<void, WorkspaceSettingsMutationFailure>;
  /** Remove a rule from lockfile only. Serialized by semaphore. */
  readonly removeRuleLock: (name: string) => Effect.Effect<void, WorkspaceLockfileMutationFailure>;
  /** Update a rule entry by applying an updater function. Serialized by semaphore. */
  readonly updateRuleEntry: (
    name: string,
    updater: (entry: RuleEntry) => RuleEntry,
  ) => Effect.Effect<void, WorkspaceSettingsMutationFailure>;
  /** Create or overwrite a rule entry in settings only. Serialized by semaphore. */
  readonly setRuleEntry: (
    name: string,
    entry: RuleEntry,
  ) => Effect.Effect<void, WorkspaceSettingsMutationFailure>;
  /** Read settings and return configured hooks, defaulting to `{}`. */
  readonly getConfiguredHookEntries: () => Effect.Effect<HooksMap, WorkspaceSettingsReadFailure>;
  /** Read lockfile and return the hooks lock map. */
  readonly getLockedHooks: () => Effect.Effect<HooksLockMap, WorkspaceLockfileReadFailure>;
  /** Read lockfile and return the entry for a specific hook, or Option.none(). */
  readonly getLockedHookEntry: (
    name: string,
  ) => Effect.Effect<Option.Option<HookLockEntry>, WorkspaceLockfileReadFailure>;
  /** Update desired hook settings and any external accepted resolution atomically. */
  readonly setHook: (args: SetHookArgs) => Effect.Effect<void, WorkspaceStateMutationFailure>;
  /** Add or update a hook in lockfile only. Used for pack dependencies. Serialized by semaphore. */
  readonly setHookLock: (
    args: SetHookArgs,
  ) => Effect.Effect<void, WorkspaceLockfileMutationFailure>;
  /** Remove a hook from both settings and lockfile. No-op if absent. Serialized by semaphore. */
  readonly removeHook: (name: string) => Effect.Effect<void, WorkspaceStateMutationFailure>;
  /** Remove a hook from settings only. Serialized by semaphore. */
  readonly removeHookSettings: (
    name: string,
  ) => Effect.Effect<void, WorkspaceSettingsMutationFailure>;
  /** Remove a hook from lockfile only. Serialized by semaphore. */
  readonly removeHookLock: (name: string) => Effect.Effect<void, WorkspaceLockfileMutationFailure>;
  /** Update a hook entry by applying an updater function. Serialized by semaphore. */
  readonly updateHookEntry: (
    name: string,
    updater: (entry: HookEntry) => HookEntry,
  ) => Effect.Effect<void, WorkspaceSettingsMutationFailure>;
  /** Create or overwrite a hook entry in settings only. Serialized by semaphore. */
  readonly setHookEntry: (
    name: string,
    entry: HookEntry,
  ) => Effect.Effect<void, WorkspaceSettingsMutationFailure>;
  /** Read, write, and remove isolated Open Knowledge Format bundles. */
  readonly getKnowledgeDiscoveryConfig: () => Effect.Effect<
    ResolvedKnowledgeDiscoveryConfig,
    WorkspaceSettingsReadFailure
  >;
  readonly getConfiguredKnowledgeEntries: () => Effect.Effect<
    KnowledgeMap,
    WorkspaceSettingsReadFailure
  >;
  readonly getLockedKnowledge: () => Effect.Effect<KnowledgeLockMap, WorkspaceLockfileReadFailure>;
  readonly getLockedKnowledgeEntry: (
    name: string,
  ) => Effect.Effect<Option.Option<KnowledgeLockEntry>, WorkspaceLockfileReadFailure>;
  readonly setKnowledge: (
    args: SetKnowledgeArgs,
  ) => Effect.Effect<void, WorkspaceStateMutationFailure>;
  readonly setKnowledgeLock: (
    args: SetKnowledgeArgs,
  ) => Effect.Effect<void, WorkspaceLockfileMutationFailure>;
  readonly removeKnowledge: (name: string) => Effect.Effect<void, WorkspaceStateMutationFailure>;
  readonly removeKnowledgeSettings: (
    name: string,
  ) => Effect.Effect<void, WorkspaceSettingsMutationFailure>;
  readonly removeKnowledgeLock: (
    name: string,
  ) => Effect.Effect<void, WorkspaceLockfileMutationFailure>;
  readonly updateKnowledgeEntry: (
    name: string,
    updater: (entry: KnowledgeEntry) => KnowledgeEntry,
  ) => Effect.Effect<void, WorkspaceSettingsMutationFailure>;
  readonly setKnowledgeEntry: (
    name: string,
    entry: KnowledgeEntry,
  ) => Effect.Effect<void, WorkspaceSettingsMutationFailure>;
  /** Read lockfile and return the skills lock map. */
  readonly getLockedSkills: () => Effect.Effect<SkillsLockMap, WorkspaceLockfileReadFailure>;
  /** Read lockfile and return the entry for a specific skill, or Option.none(). */
  readonly getLockedSkill: (
    name: string,
  ) => Effect.Effect<Option.Option<SkillLockEntry>, WorkspaceLockfileReadFailure>;
  /** Compute skill directory paths. If source is omitted, looks up the lock entry to determine source type. */
  readonly getSkillDir: (
    name: string,
    source?: SkillPathSource,
  ) => Effect.Effect<SkillDirPaths, WorkspaceStateReadFailure | LockedSkillMissing>;
  /** Update desired skill settings and any external accepted resolution atomically. */
  readonly setSkill: (args: SetSkillArgs) => Effect.Effect<void, WorkspaceStateMutationFailure>;
  /** Add or update a skill in lockfile only (skip settings). Used for pack dependencies. Serialized by semaphore. */
  readonly setSkillLock: (
    args: SetSkillArgs,
  ) => Effect.Effect<void, WorkspaceLockfileMutationFailure>;
  /** Remove a skill from both settings and lockfile. No-op if absent. Serialized by semaphore. */
  readonly removeSkill: (name: string) => Effect.Effect<void, WorkspaceStateMutationFailure>;
  /** Remove a skill from settings only (keep lockfile entry). Used when a pack still references the skill. Serialized by semaphore. */
  readonly removeSkillFromSettings: (
    name: string,
  ) => Effect.Effect<void, WorkspaceSettingsMutationFailure>;
  /** Update a skill entry by applying an updater function. Collapses back to settings form. Serialized by semaphore. */
  readonly updateSkillEntry: (
    name: string,
    updater: (entry: SkillEntry) => SkillEntry,
  ) => Effect.Effect<void, WorkspaceSettingsMutationFailure | SettingsEntryMissing>;
  /** Create or overwrite a skill entry in settings only (no lockfile). Serialized by semaphore. */
  readonly setSkillEntry: (
    name: string,
    entry: SkillEntry,
  ) => Effect.Effect<void, WorkspaceSettingsMutationFailure>;
  /** Update the agents field on a lock entry. Serialized by semaphore. */
  /** Append an agent ID if not already present and write to disk. Fails typed if invalid. Serialized by semaphore. */
  readonly addConfiguredAgent: (
    agentId: string,
  ) => Effect.Effect<void, WorkspaceSettingsMutationFailure | InvalidAgentId>;
  /** Remove an agent ID if present and write to disk. Fails typed if invalid. Serialized by semaphore. */
  readonly removeConfiguredAgent: (
    agentId: string,
  ) => Effect.Effect<void, WorkspaceSettingsMutationFailure | InvalidAgentId>;
  /** Read settings and return configured packs, defaulting to `{}`. */
  readonly getConfiguredPackEntries: () => Effect.Effect<PacksMap, WorkspaceSettingsReadFailure>;
  /** Read lockfile and return the packs lock map. */
  readonly getLockedPacks: () => Effect.Effect<PacksLockMap, WorkspaceLockfileReadFailure>;
  /** Read lockfile and return the entry for a specific pack, or Option.none(). */
  readonly getLockedPack: (
    name: string,
  ) => Effect.Effect<Option.Option<PackLockEntry>, WorkspaceLockfileReadFailure>;
  /** Update desired Pack settings and any Registry accepted resolution atomically. */
  readonly setPack: (args: SetPackArgs) => Effect.Effect<void, WorkspaceStateMutationFailure>;
  /** Update an accepted external Pack resolution without changing desired settings. */
  readonly setPackLock: (
    args: SetPackArgs,
  ) => Effect.Effect<void, WorkspaceLockfileMutationFailure>;
  /** Create or overwrite a pack entry in settings only (no lockfile). Serialized by semaphore. */
  readonly setPackEntry: (
    name: string,
    entry: PackEntry,
  ) => Effect.Effect<void, WorkspaceSettingsMutationFailure>;
  /** Remove a pack from both settings and lockfile. No-op if absent. Serialized by semaphore. */
  readonly removePack: (name: string) => Effect.Effect<void, WorkspaceStateMutationFailure>;
  /** Compute the pack directory path. Packs are always registry-sourced. */
  readonly getPackDir: (
    name: string,
    owner: Handle,
    sourceName: string,
  ) => Effect.Effect<PackDirPath>;
  /** Read lockfile and return the subagents lock map. */
  readonly getLockedSubagents: () => Effect.Effect<SubagentsLockMap, WorkspaceLockfileReadFailure>;
  /** Read lockfile and return the entry for a specific subagent, or Option.none(). */
  readonly getLockedSubagent: (
    name: string,
  ) => Effect.Effect<Option.Option<SubagentLockEntry>, WorkspaceLockfileReadFailure>;
  /** Read settings and return configured subagents, defaulting to `{}`. */
  readonly getConfiguredSubagentEntries: () => Effect.Effect<
    SubagentsMap,
    WorkspaceSettingsReadFailure
  >;
  /** Update desired subagent settings and any external accepted resolution atomically. */
  readonly setSubagent: (
    args: SetSubagentArgs,
  ) => Effect.Effect<void, WorkspaceStateMutationFailure>;
  /** Add or update a subagent in lockfile only (skip settings). Used for pack dependencies. Serialized by semaphore. */
  readonly setSubagentLock: (
    args: SetSubagentArgs,
  ) => Effect.Effect<void, WorkspaceLockfileMutationFailure>;
  /** Remove a subagent from both settings and lockfile. No-op if absent. Serialized by semaphore. */
  readonly removeSubagent: (name: string) => Effect.Effect<void, WorkspaceStateMutationFailure>;
  /** Update a subagent entry by applying an updater function. Collapses back to settings form. Serialized by semaphore. */
  readonly updateSubagentEntry: (
    name: string,
    updater: (entry: SubagentEntry) => SubagentEntry,
  ) => Effect.Effect<void, WorkspaceSettingsMutationFailure>;
  /** Create or overwrite a subagent entry in settings only (no lockfile). Serialized by semaphore. */
  readonly setSubagentEntry: (
    name: string,
    entry: SubagentEntry,
  ) => Effect.Effect<void, WorkspaceSettingsMutationFailure>;
  // --- Granular subagent removal methods (settings-only or lockfile-only) ---
  /** Remove a subagent from settings only (keep lockfile entry). Serialized by semaphore. */
  readonly removeSubagentSettings: (
    name: string,
  ) => Effect.Effect<void, WorkspaceSettingsMutationFailure>;
  /** Remove a subagent from lockfile only (keep settings entry). Serialized by semaphore. */
  readonly removeSubagentLock: (
    name: string,
  ) => Effect.Effect<void, WorkspaceLockfileMutationFailure>;
  /** Read lockfile and return the MCP servers lock map. */
  readonly getLockedMcpServers: () => Effect.Effect<
    McpServersLockMap,
    WorkspaceLockfileReadFailure
  >;
  /** Read lockfile and return the entry for a specific MCP server, or Option.none(). */
  readonly getLockedMcpServer: (
    name: string,
  ) => Effect.Effect<Option.Option<McpServerLockEntry>, WorkspaceLockfileReadFailure>;
  /** Update desired MCP settings and any external accepted resolution atomically. */
  readonly setMcpServer: (
    args: SetMcpServerArgs,
  ) => Effect.Effect<void, WorkspaceStateMutationFailure>;
  /** Add or update an MCP server in lockfile only (skip settings). Used for pack dependencies. Serialized by semaphore. */
  readonly setMcpServerLock: (
    args: SetMcpServerArgs,
  ) => Effect.Effect<void, WorkspaceLockfileMutationFailure>;
  /** Update an MCP server entry by applying an updater function. Collapses back to settings form. Serialized by semaphore. */
  readonly updateMcpServerEntry: (
    name: string,
    updater: (entry: McpServerEntry) => McpServerEntry,
  ) => Effect.Effect<void, WorkspaceSettingsMutationFailure | SettingsEntryMissing>;
  /** Create or overwrite an MCP server entry in settings only (no lockfile). Serialized by semaphore. */
  readonly setMcpServerEntry: (
    name: string,
    entry: McpServerEntry,
  ) => Effect.Effect<void, WorkspaceSettingsMutationFailure>;
  /** Remove an MCP server from both settings and lockfile. No-op if absent. Serialized by semaphore. */
  readonly removeMcpServer: (name: string) => Effect.Effect<void, WorkspaceStateMutationFailure>;
  // --- Granular removal methods (settings-only or lockfile-only) ---
  /** Remove a skill from lockfile only (keep settings entry). Serialized by semaphore. */
  readonly removeSkillLock: (name: string) => Effect.Effect<void, WorkspaceLockfileMutationFailure>;
  /** Remove an MCP server from settings only (keep lockfile entry). Serialized by semaphore. */
  readonly removeMcpServerSettings: (
    name: string,
  ) => Effect.Effect<void, WorkspaceSettingsMutationFailure>;
  /** Remove an MCP server from lockfile only (keep settings entry). Serialized by semaphore. */
  readonly removeMcpServerLock: (
    name: string,
  ) => Effect.Effect<void, WorkspaceLockfileMutationFailure>;
  /** Remove a pack from settings only (keep lockfile entry). Serialized by semaphore. */
  readonly removePackSettings: (
    name: string,
  ) => Effect.Effect<void, WorkspaceSettingsMutationFailure>;
  /** Remove a pack from lockfile only (keep settings entry). Serialized by semaphore. */
  readonly removePackLock: (name: string) => Effect.Effect<void, WorkspaceLockfileMutationFailure>;
  // --- Pack dependency queries ---
  /** Check if an extension target is referenced by any installed pack's dependency maps. */
  readonly isExtensionRequiredByInstalledPack: (
    target: ExtensionTarget,
  ) => Effect.Effect<boolean, WorkspaceStateReadFailure | DesiredPackGraphIncomplete>;
}

// ---------------------------------------------------------------------------
// Service tag
// ---------------------------------------------------------------------------

/**
 * Effect service tag for workspace mutations.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class WorkspaceMutations extends ServiceMap.Service<
  WorkspaceMutations,
  WorkspaceMutationsService
>()("@agentxm/extension-management/unstable/workspace/service-interface/WorkspaceMutations") {
  /**
   * Create a layer from a custom service implementation.
   */
  static readonly layer = (service: WorkspaceMutationsService): Layer.Layer<WorkspaceMutations> =>
    Layer.succeed(WorkspaceMutations, service);
}

/**
 * Options for creating workspace mutations.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface WorkspaceMutationsOptions {
  /** Whether to use the user workspace or a project workspace. */
  readonly scope: WorkspaceScope;
  /** Canonical project root supplied by the transport boundary. */
  readonly projectRoot: AbsolutePath;
  /** Explicit agent IDs to use during initialization (overrides detection and prompting) */
  readonly agents?: ReadonlyArray<string>;
  /** Auto-accept setup defaults and confirmations */
  readonly yes?: boolean;
  /** Suppress interactive setup prompts; the transport boundary resolves flag/CI/TTY. */
  readonly nonInteractive?: boolean;
  /** Compute the setup plan without writing files */
  readonly preview?: boolean;
  /** Built-in source host configs (defaults to git forges only when not provided) */
  readonly builtInSources?: ReadonlyArray<SourceHostConfig>;
  /** Allow read-only inspection when settings are absent. */
  readonly allowUninitialized?: boolean;
}

/**
 * Error loading workspace mutations: scoped settings reads, layout
 * resolution, and the initialization gate.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type WorkspaceMutationsError =
  WorkspaceSettingsReadFailure | WorkspaceLayoutError | WorkspaceNotInitialized;
