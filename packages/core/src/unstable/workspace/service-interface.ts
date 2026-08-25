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
import * as Layer from "effect/Layer";
import type * as Option from "effect/Option";
import type * as Scope from "effect/Scope";
import * as ServiceMap from "effect/Context";

import type { AppError } from "../app-error/index.js";
import type { WorkspaceRestorationIncomplete } from "./transaction.js";
import type { TransitionContention, TransitionLockHolder } from "./transition-lock.js";
import type { InstallableExtensionType } from "../extensions/installable-types.js";
import type { ExtensionVisibility } from "../extensions/common.js";
import type { Handle } from "../extensions/handle.js";
import type { ExtensionRef } from "../extensions/refs.js";
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
import type { ScopedReleaseAgeExcludePattern } from "../registry/index.js";
import type { ReadModelRecordRow } from "./read-model-record-types.js";
import type { WorkspaceScope } from "./scope.js";
import type { ExtensionInventory } from "./read-model/extensions/inventory.js";
import type { LockfileState } from "./augment-plan.js";
import type { ResolvedKnowledgeDiscoveryConfig } from "../knowledge/discovery-config.js";
import type { DesiredStateGraph } from "./desired-state-graph.js";
import type { AbsolutePath } from "../utils/path-types.js";
import type { ProjectionPlan } from "../projection/planning.js";
import type { ConfigurableAgentId } from "../agent-capabilities/index.js";
import type { WorkspaceLayout } from "./layout.js";
import type { ExtensionPathSource } from "../extensions/extension-paths.js";

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

/**
 * Machine-local effects observed during the most recent materialization.
 *
 * This data is intentionally ephemeral. It supports operation output without
 * making agent-specific paths part of the shared lockfile contract.
 */
export interface MaterializationObservation {
  readonly agents: ReadonlyArray<string>;
  readonly targets: ReadonlyArray<{
    readonly path: string;
    readonly agentIds?: ReadonlyArray<string>;
  }>;
}

export interface WorkspaceLifecycleTransactionArgs<A, E = AppError, R = never> {
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

export type WorkspaceTransactionRunner = <A, E = AppError, R = never>(
  args: WorkspaceLifecycleTransactionArgs<A, E, R>,
) => Effect.Effect<A, AppError | WorkspaceRestorationIncomplete | E, R>;

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
) => Effect.Effect<Option.Option<TransitionContention>, AppError, Scope.Scope>;

// ---------------------------------------------------------------------------
// Extension Manager Interface
// ---------------------------------------------------------------------------

/**
 * Per-extension-type lifecycle manager contract.
 *
 * All methods have `R = never` — dependencies are captured during construction.
 */
export interface ExtensionManager<TRef extends ExtensionRef> {
  readonly type: TRef["type"];
  readonly runTransaction: WorkspaceTransactionRunner;
  readonly isInstalled: (args: {
    readonly target: ExtensionTarget;
  }) => Effect.Effect<boolean, AppError, never>;
  readonly materializeInstall: (args: {
    readonly ref: TRef;
    /** When true, re-materialize unconditionally instead of reusing an existing canonical tree. */
    readonly force?: boolean;
  }) => Effect.Effect<void, AppError, never>;
  /**
   * Capture cleanup for the currently accepted canonical package before a
   * replacement writes its new lock entry. The returned effect runs only
   * after the replacement resolution has been committed inside the same
   * workspace transaction.
   */
  readonly prepareSourceTransition?: (args: {
    readonly ref: TRef;
  }) => Effect.Effect<Effect.Effect<void, AppError, never>, AppError, never>;
  readonly getLastMaterialization?: (args: {
    readonly target: ExtensionTargetFor<TRef>;
  }) => Effect.Effect<MaterializationObservation, never, never>;
  /** Build opaque projection plans after desired state and canonical content commit. */
  readonly projectionPlans?: () => Effect.Effect<ReadonlyArray<ProjectionPlan>, AppError, never>;
  readonly getLastUnmaterialization?: (args: {
    readonly target: ExtensionTargetFor<TRef>;
  }) => Effect.Effect<MaterializationObservation, never, never>;
  readonly getConfiguredSource?: (args: {
    readonly target: ExtensionTarget;
  }) => Effect.Effect<Option.Option<string>, AppError, never>;
  readonly listMaterializable: () => Effect.Effect<ReadonlyArray<TRef>, AppError, never>;
  readonly materializeUninstall: (args: {
    readonly target: ExtensionTargetFor<TRef>;
  }) => Effect.Effect<void, AppError, never>;
  /** Remove active projections while retaining canonical managed content. */
  readonly materializeDeactivate: (args: {
    readonly target: ExtensionTargetFor<TRef>;
  }) => Effect.Effect<void, AppError, never>;
  readonly upsertSettingsEntry: (args: {
    readonly ref: TRef;
    readonly versionRange: Option.Option<string>;
  }) => Effect.Effect<void, AppError, never>;
  readonly removeSettingsEntry: (args: {
    readonly target: ExtensionTargetFor<TRef>;
  }) => Effect.Effect<void, AppError, never>;
  readonly upsertLockfileEntry: (args: {
    readonly ref: TRef;
  }) => Effect.Effect<void, AppError, never>;
  readonly removeLockfileEntry: (args: {
    readonly target: ExtensionTargetFor<TRef>;
  }) => Effect.Effect<void, AppError, never>;
}

export interface WorkspaceReadModelRecords {
  /** Deterministic inventory across every installable extension type or one selected type. */
  readonly getInventory: (options: {
    readonly type?: InstallableExtensionType;
  }) => Effect.Effect<ExtensionInventory, AppError>;
  /** Read-only physical inventory for one extension type. */
  readonly getExtensionInventory: (
    type: InstallableExtensionType,
    options: {
      readonly agents?: ReadonlyArray<string>;
    },
  ) => Effect.Effect<ExtensionInventory, AppError>;
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
  ) => Effect.Effect<ReadonlyArray<ReadModelRecordRow>, AppError>;
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
  /** Whether this is a user-scope workspace (~/.axm) or project workspace (.axm) */
  readonly scope: WorkspaceScope;
  /** Path to the .axm directory */
  readonly path: string;
  /** Project root directory (parent of .axm) */
  readonly baseDir: string;
  /** Explicit scope-aware paths for authoritative, runtime, and package state. */
  readonly layout: WorkspaceLayout;
  /** Run one coupled authoritative workspace transition under the workspace lock. */
  readonly runTransaction: WorkspaceTransactionRunner;
  /** Acquire the workspace transition for a post-confirmation apply. */
  readonly acquireTransition: WorkspaceTransitionAcquirer;
  /** Probe lockfile state for policy decisions: ok | missing | invalid. */
  readonly getLockfileState: () => Effect.Effect<LockfileState, AppError>;
  /** Build the authoritative desired extension graph from settings and installed pack manifests. */
  readonly getDesiredStateGraph: () => Effect.Effect<DesiredStateGraph, AppError>;
  /** Merged sources from project, user-scope, and built-in defaults. Cached per workspace lifetime. */
  readonly getConfiguredSources: () => Effect.Effect<ReadonlyArray<SourceHostConfig>, AppError>;
  /** Lookup a source by name from the merged sources list. */
  readonly getConfiguredSourceByName: (
    name: string,
  ) => Effect.Effect<Option.Option<SourceHostConfig>, AppError>;
  /** Filter merged sources to registry sources. */
  readonly getRegistrySourceHosts: () => Effect.Effect<
    ReadonlyArray<Extract<SourceHostConfig, { type: "registry" }>>,
    AppError
  >;
  readonly records: WorkspaceReadModelRecords;
  /** Resolve owner: project settings -> user-scope settings -> Option.none(). */
  readonly getConfiguredOwner: () => Effect.Effect<Option.Option<Handle>, AppError>;
  /** Repository publication default for this exact workspace scope. */
  readonly getPublishDefaultVisibility: () => Effect.Effect<
    Option.Option<ExtensionVisibility>,
    AppError
  >;
  /** Resolve minimumReleaseAge: project settings -> user-scope settings -> default. */
  readonly getMinimumReleaseAge: () => Effect.Effect<MinimumReleaseAge, AppError>;
  /** Resolve minimumReleaseAgeExclude with the same scope precedence; an explicit [] wins. */
  readonly getMinimumReleaseAgeExclude: () => Effect.Effect<
    ReadonlyArray<ScopedReleaseAgeExcludePattern>,
    AppError
  >;
  /** Append a source to project settings. Invalidates the sources cache. Serialized by semaphore. */
  readonly addConfiguredSource: (source: SourceHostConfig) => Effect.Effect<void, AppError>;
  /** Read settings and return configured skills, defaulting to `{}`. */
  readonly getConfiguredSkillEntries: () => Effect.Effect<SkillsMap, AppError>;
  /** Read settings and return the configured agent IDs, defaulting to `[]`. */
  readonly getConfiguredAgents: () => Effect.Effect<ReadonlyArray<string>, AppError>;
  /** Read settings and return instruction-file config, defaulting to unset. */
  readonly getInstructionsConfig: () => Effect.Effect<
    Option.Option<InstructionsConfigValue>,
    AppError
  >;
  /** Set instruction-file config. Use false for explicit manual mode. Serialized by semaphore. */
  readonly setInstructionsConfig: (
    config: InstructionsConfigValue,
  ) => Effect.Effect<void, AppError>;
  /** Read settings and return configured MCP server entries, defaulting to `{}`. */
  readonly getConfiguredMcpServerEntries: () => Effect.Effect<McpServersMap, AppError>;
  /** Read settings and return configured rules, defaulting to `{}`. */
  readonly getConfiguredRuleEntries: () => Effect.Effect<RulesMap, AppError>;
  /** Read lockfile and return the rules lock map. */
  readonly getLockedRules: () => Effect.Effect<RulesLockMap, AppError>;
  /** Read lockfile and return the entry for a specific rule, or Option.none(). */
  readonly getLockedRuleEntry: (
    name: string,
  ) => Effect.Effect<Option.Option<RuleLockEntry>, AppError>;
  /** Update desired rule settings and any external accepted resolution atomically. */
  readonly setRule: (args: SetRuleArgs) => Effect.Effect<void, AppError>;
  /** Add or update a rule in lockfile only. Used for pack dependencies. Serialized by semaphore. */
  readonly setRuleLock: (args: SetRuleArgs) => Effect.Effect<void, AppError>;
  /** Remove a rule from both settings and lockfile. No-op if absent. Serialized by semaphore. */
  readonly removeRule: (name: string) => Effect.Effect<void, AppError>;
  /** Remove a rule from settings only. Serialized by semaphore. */
  readonly removeRuleSettings: (name: string) => Effect.Effect<void, AppError>;
  /** Remove a rule from lockfile only. Serialized by semaphore. */
  readonly removeRuleLock: (name: string) => Effect.Effect<void, AppError>;
  /** Update a rule entry by applying an updater function. Serialized by semaphore. */
  readonly updateRuleEntry: (
    name: string,
    updater: (entry: RuleEntry) => RuleEntry,
  ) => Effect.Effect<void, AppError>;
  /** Create or overwrite a rule entry in settings only. Serialized by semaphore. */
  readonly setRuleEntry: (name: string, entry: RuleEntry) => Effect.Effect<void, AppError>;
  /** Read settings and return configured hooks, defaulting to `{}`. */
  readonly getConfiguredHookEntries: () => Effect.Effect<HooksMap, AppError>;
  /** Read lockfile and return the hooks lock map. */
  readonly getLockedHooks: () => Effect.Effect<HooksLockMap, AppError>;
  /** Read lockfile and return the entry for a specific hook, or Option.none(). */
  readonly getLockedHookEntry: (
    name: string,
  ) => Effect.Effect<Option.Option<HookLockEntry>, AppError>;
  /** Update desired hook settings and any external accepted resolution atomically. */
  readonly setHook: (args: SetHookArgs) => Effect.Effect<void, AppError>;
  /** Add or update a hook in lockfile only. Used for pack dependencies. Serialized by semaphore. */
  readonly setHookLock: (args: SetHookArgs) => Effect.Effect<void, AppError>;
  /** Remove a hook from both settings and lockfile. No-op if absent. Serialized by semaphore. */
  readonly removeHook: (name: string) => Effect.Effect<void, AppError>;
  /** Remove a hook from settings only. Serialized by semaphore. */
  readonly removeHookSettings: (name: string) => Effect.Effect<void, AppError>;
  /** Remove a hook from lockfile only. Serialized by semaphore. */
  readonly removeHookLock: (name: string) => Effect.Effect<void, AppError>;
  /** Update a hook entry by applying an updater function. Serialized by semaphore. */
  readonly updateHookEntry: (
    name: string,
    updater: (entry: HookEntry) => HookEntry,
  ) => Effect.Effect<void, AppError>;
  /** Create or overwrite a hook entry in settings only. Serialized by semaphore. */
  readonly setHookEntry: (name: string, entry: HookEntry) => Effect.Effect<void, AppError>;
  /** Read, write, and remove isolated Open Knowledge Format bundles. */
  readonly getKnowledgeDiscoveryConfig: () => Effect.Effect<
    ResolvedKnowledgeDiscoveryConfig,
    AppError
  >;
  readonly getConfiguredKnowledgeEntries: () => Effect.Effect<KnowledgeMap, AppError>;
  readonly getLockedKnowledge: () => Effect.Effect<KnowledgeLockMap, AppError>;
  readonly getLockedKnowledgeEntry: (
    name: string,
  ) => Effect.Effect<Option.Option<KnowledgeLockEntry>, AppError>;
  readonly setKnowledge: (args: SetKnowledgeArgs) => Effect.Effect<void, AppError>;
  readonly setKnowledgeLock: (args: SetKnowledgeArgs) => Effect.Effect<void, AppError>;
  readonly removeKnowledge: (name: string) => Effect.Effect<void, AppError>;
  readonly removeKnowledgeSettings: (name: string) => Effect.Effect<void, AppError>;
  readonly removeKnowledgeLock: (name: string) => Effect.Effect<void, AppError>;
  readonly updateKnowledgeEntry: (
    name: string,
    updater: (entry: KnowledgeEntry) => KnowledgeEntry,
  ) => Effect.Effect<void, AppError>;
  readonly setKnowledgeEntry: (
    name: string,
    entry: KnowledgeEntry,
  ) => Effect.Effect<void, AppError>;
  /** Read lockfile and return the skills lock map. */
  readonly getLockedSkills: () => Effect.Effect<SkillsLockMap, AppError>;
  /** Read lockfile and return the entry for a specific skill, or Option.none(). */
  readonly getLockedSkill: (name: string) => Effect.Effect<Option.Option<SkillLockEntry>, AppError>;
  /** Compute skill directory paths. If source is omitted, looks up the lock entry to determine source type. */
  readonly getSkillDir: (
    name: string,
    source?: SkillPathSource,
  ) => Effect.Effect<SkillDirPaths, AppError>;
  /** Update desired skill settings and any external accepted resolution atomically. */
  readonly setSkill: (args: SetSkillArgs) => Effect.Effect<void, AppError>;
  /** Add or update a skill in lockfile only (skip settings). Used for pack dependencies. Serialized by semaphore. */
  readonly setSkillLock: (args: SetSkillArgs) => Effect.Effect<void, AppError>;
  /** Remove a skill from both settings and lockfile. No-op if absent. Serialized by semaphore. */
  readonly removeSkill: (name: string) => Effect.Effect<void, AppError>;
  /** Remove a skill from settings only (keep lockfile entry). Used when a pack still references the skill. Serialized by semaphore. */
  readonly removeSkillFromSettings: (name: string) => Effect.Effect<void, AppError>;
  /** Update a skill entry by applying an updater function. Collapses back to settings form. Serialized by semaphore. */
  readonly updateSkillEntry: (
    name: string,
    updater: (entry: SkillEntry) => SkillEntry,
  ) => Effect.Effect<void, AppError>;
  /** Create or overwrite a skill entry in settings only (no lockfile). Serialized by semaphore. */
  readonly setSkillEntry: (name: string, entry: SkillEntry) => Effect.Effect<void, AppError>;
  /** Update the agents field on a lock entry. Serialized by semaphore. */
  /** Append an agent ID if not already present and write to disk. Fails with AppError if invalid. Serialized by semaphore. */
  readonly addConfiguredAgent: (agentId: string) => Effect.Effect<void, AppError>;
  /** Remove an agent ID if present and write to disk. Fails with AppError if invalid. Serialized by semaphore. */
  readonly removeConfiguredAgent: (agentId: string) => Effect.Effect<void, AppError>;
  /** Read settings and return configured packs, defaulting to `{}`. */
  readonly getConfiguredPackEntries: () => Effect.Effect<PacksMap, AppError>;
  /** Read lockfile and return the packs lock map. */
  readonly getLockedPacks: () => Effect.Effect<PacksLockMap, AppError>;
  /** Read lockfile and return the entry for a specific pack, or Option.none(). */
  readonly getLockedPack: (name: string) => Effect.Effect<Option.Option<PackLockEntry>, AppError>;
  /** Update desired Pack settings and any Registry accepted resolution atomically. */
  readonly setPack: (args: SetPackArgs) => Effect.Effect<void, AppError>;
  /** Update an accepted external Pack resolution without changing desired settings. */
  readonly setPackLock: (args: SetPackArgs) => Effect.Effect<void, AppError>;
  /** Create or overwrite a pack entry in settings only (no lockfile). Serialized by semaphore. */
  readonly setPackEntry: (name: string, entry: PackEntry) => Effect.Effect<void, AppError>;
  /** Remove a pack from both settings and lockfile. No-op if absent. Serialized by semaphore. */
  readonly removePack: (name: string) => Effect.Effect<void, AppError>;
  /** Compute the pack directory path. Packs are always registry-sourced. */
  readonly getPackDir: (
    name: string,
    owner: Handle,
    sourceName: string,
  ) => Effect.Effect<PackDirPath, AppError>;
  /** Read lockfile and return the subagents lock map. */
  readonly getLockedSubagents: () => Effect.Effect<SubagentsLockMap, AppError>;
  /** Read lockfile and return the entry for a specific subagent, or Option.none(). */
  readonly getLockedSubagent: (
    name: string,
  ) => Effect.Effect<Option.Option<SubagentLockEntry>, AppError>;
  /** Read settings and return configured subagents, defaulting to `{}`. */
  readonly getConfiguredSubagentEntries: () => Effect.Effect<SubagentsMap, AppError>;
  /** Update desired subagent settings and any external accepted resolution atomically. */
  readonly setSubagent: (args: SetSubagentArgs) => Effect.Effect<void, AppError>;
  /** Add or update a subagent in lockfile only (skip settings). Used for pack dependencies. Serialized by semaphore. */
  readonly setSubagentLock: (args: SetSubagentArgs) => Effect.Effect<void, AppError>;
  /** Remove a subagent from both settings and lockfile. No-op if absent. Serialized by semaphore. */
  readonly removeSubagent: (name: string) => Effect.Effect<void, AppError>;
  /** Update a subagent entry by applying an updater function. Collapses back to settings form. Serialized by semaphore. */
  readonly updateSubagentEntry: (
    name: string,
    updater: (entry: SubagentEntry) => SubagentEntry,
  ) => Effect.Effect<void, AppError>;
  /** Create or overwrite a subagent entry in settings only (no lockfile). Serialized by semaphore. */
  readonly setSubagentEntry: (name: string, entry: SubagentEntry) => Effect.Effect<void, AppError>;
  // --- Granular subagent removal methods (settings-only or lockfile-only) ---
  /** Remove a subagent from settings only (keep lockfile entry). Serialized by semaphore. */
  readonly removeSubagentSettings: (name: string) => Effect.Effect<void, AppError>;
  /** Remove a subagent from lockfile only (keep settings entry). Serialized by semaphore. */
  readonly removeSubagentLock: (name: string) => Effect.Effect<void, AppError>;
  /** Read lockfile and return the MCP servers lock map. */
  readonly getLockedMcpServers: () => Effect.Effect<McpServersLockMap, AppError>;
  /** Read lockfile and return the entry for a specific MCP server, or Option.none(). */
  readonly getLockedMcpServer: (
    name: string,
  ) => Effect.Effect<Option.Option<McpServerLockEntry>, AppError>;
  /** Update desired MCP settings and any external accepted resolution atomically. */
  readonly setMcpServer: (args: SetMcpServerArgs) => Effect.Effect<void, AppError>;
  /** Add or update an MCP server in lockfile only (skip settings). Used for pack dependencies. Serialized by semaphore. */
  readonly setMcpServerLock: (args: SetMcpServerArgs) => Effect.Effect<void, AppError>;
  /** Update an MCP server entry by applying an updater function. Collapses back to settings form. Serialized by semaphore. */
  readonly updateMcpServerEntry: (
    name: string,
    updater: (entry: McpServerEntry) => McpServerEntry,
  ) => Effect.Effect<void, AppError>;
  /** Create or overwrite an MCP server entry in settings only (no lockfile). Serialized by semaphore. */
  readonly setMcpServerEntry: (
    name: string,
    entry: McpServerEntry,
  ) => Effect.Effect<void, AppError>;
  /** Remove an MCP server from both settings and lockfile. No-op if absent. Serialized by semaphore. */
  readonly removeMcpServer: (name: string) => Effect.Effect<void, AppError>;
  // --- Granular removal methods (settings-only or lockfile-only) ---
  /** Remove a skill from lockfile only (keep settings entry). Serialized by semaphore. */
  readonly removeSkillLock: (name: string) => Effect.Effect<void, AppError>;
  /** Remove an MCP server from settings only (keep lockfile entry). Serialized by semaphore. */
  readonly removeMcpServerSettings: (name: string) => Effect.Effect<void, AppError>;
  /** Remove an MCP server from lockfile only (keep settings entry). Serialized by semaphore. */
  readonly removeMcpServerLock: (name: string) => Effect.Effect<void, AppError>;
  /** Remove a pack from settings only (keep lockfile entry). Serialized by semaphore. */
  readonly removePackSettings: (name: string) => Effect.Effect<void, AppError>;
  /** Remove a pack from lockfile only (keep settings entry). Serialized by semaphore. */
  readonly removePackLock: (name: string) => Effect.Effect<void, AppError>;
  // --- Pack dependency queries ---
  /** Check if an extension target is referenced by any installed pack's dependency maps. */
  readonly isExtensionRequiredByInstalledPack: (
    target: ExtensionTarget,
  ) => Effect.Effect<boolean, AppError>;
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
>()("@agentxm/client-core/unstable/workspace/service-interface/WorkspaceMutations") {
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
  /** Whether to use user-scope workspace (~/.axm) or project workspace (.axm) */
  readonly scope: WorkspaceScope;
  /** Canonical project root supplied by the transport boundary. */
  readonly projectRoot: AbsolutePath;
  /** Explicit agent IDs to use during initialization (overrides detection and prompting) */
  readonly agents?: ReadonlyArray<string>;
  /** Auto-accept setup defaults and confirmations */
  readonly yes?: boolean;
  /** Compute the setup plan without writing files */
  readonly preview?: boolean;
  /** Built-in source host configs (defaults to git forges only when not provided) */
  readonly builtInSources?: ReadonlyArray<SourceHostConfig>;
  /** Allow read-only inspection when settings are absent. */
  readonly allowUninitialized?: boolean;
}

/**
 * Error loading workspace mutations.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type WorkspaceMutationsError = AppError;
