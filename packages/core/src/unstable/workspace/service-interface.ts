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
import type * as Record from "effect/Record";
import * as ServiceMap from "effect/Context";

import type { AppError } from "../app-error/index.js";
import type { Handle } from "../extensions/handle.js";
import type { ExtensionRef } from "../extensions/refs.js";
import type {
  RegistryExtensionPackLockEntryArgs,
  CommandLockEntry,
  CommandsLockMap,
  McpServerLockEntry,
  McpServersLockMap,
  ExtensionPackLockEntry,
  ExtensionPacksLockMap,
  SkillLockEntry,
  SkillsLockMap,
  SubagentLockEntry,
  SubagentsLockMap,
} from "../lockfile/index.js";
import type {
  CommandEntry,
  SkillEntry,
  SubagentEntry,
  SourceHostConfig,
} from "../settings/index.js";
import type {
  ConfiguredCommand,
  ConfiguredExtensionRef,
  ConfiguredSkill,
  ConfiguredSubagent,
  InstalledCommand,
  InstalledExtensionRef,
  InstalledSkill,
  InstalledSubagent,
  UnmanagedCommand,
  UnmanagedExtensionRef,
  UnmanagedSkill,
} from "./read-model-record-types.js";
import type { WorkspaceScope } from "./scope.js";
import type { LockfileState } from "./augment-plan.js";

// ---------------------------------------------------------------------------
// CLI-specific types (inlined to avoid circular dependency with CLI)
// ---------------------------------------------------------------------------

/**
 * Minimal structural discriminant for determining skill path layout.
 *
 * Registry refs carry an owner for the canonical path; all other ref types
 * use the shared external extensions directory.
 */
export type SkillPathSource =
  | { readonly refType: "registry"; readonly owner: Handle }
  | { readonly refType: "git-hosted" | "local" };

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
export interface ExtensionPackDirPath {
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

export interface CommandExtensionTarget {
  readonly type: "command";
  readonly name: string;
}

export interface McpServerExtensionTarget {
  readonly type: "mcp-server";
  readonly name: string;
}

export interface SubagentExtensionTarget {
  readonly type: "subagent";
  readonly name: string;
}

/**
 * Identifies a specific extension by type and name.
 */
export type ExtensionTarget =
  | SkillExtensionTarget
  | PackExtensionTarget
  | CommandExtensionTarget
  | McpServerExtensionTarget
  | SubagentExtensionTarget;

/**
 * Maps an ExtensionRef type to its corresponding ExtensionTarget type.
 */
export type ExtensionTargetFor<TRef extends ExtensionRef> = Extract<
  ExtensionTarget,
  { readonly type: TRef["type"] }
>;

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
  readonly isInstalled: (args: {
    readonly target: ExtensionTargetFor<TRef>;
  }) => Effect.Effect<boolean, AppError, never>;
  readonly materializeInstall: (args: {
    readonly ref: TRef;
  }) => Effect.Effect<void, AppError, never>;
  readonly materializeUninstall: (args: {
    readonly target: ExtensionTargetFor<TRef>;
  }) => Effect.Effect<void, AppError, never>;
  readonly upsertSettingsEntry: (args: {
    readonly ref: TRef;
    readonly versionConstraint: Option.Option<string>;
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
  /** Configured skills from settings with source metadata. */
  readonly getConfiguredSkills: () => Effect.Effect<
    Record.ReadonlyRecord<string, ConfiguredSkill>,
    AppError
  >;
  /** Unmanaged skills (on-disk only, not configured or implicit). */
  readonly getUnmanagedSkills: () => Effect.Effect<
    Record.ReadonlyRecord<string, UnmanagedSkill>,
    AppError
  >;
  /** Installed skills (configured + implicit). */
  readonly getInstalledSkills: () => Effect.Effect<
    Record.ReadonlyRecord<string, InstalledSkill>,
    AppError
  >;
  readonly getConfiguredCommands: () => Effect.Effect<
    Record.ReadonlyRecord<string, ConfiguredCommand>,
    AppError
  >;
  readonly getUnmanagedCommands: () => Effect.Effect<
    Record.ReadonlyRecord<string, UnmanagedCommand>,
    AppError
  >;
  readonly getInstalledCommands: () => Effect.Effect<
    Record.ReadonlyRecord<string, InstalledCommand>,
    AppError
  >;
  readonly getConfiguredMcpServers: () => Effect.Effect<
    Record.ReadonlyRecord<string, ConfiguredExtensionRef>,
    AppError
  >;
  readonly getUnmanagedMcpServers: () => Effect.Effect<
    Record.ReadonlyRecord<string, UnmanagedExtensionRef>,
    AppError
  >;
  readonly getInstalledMcpServers: () => Effect.Effect<
    Record.ReadonlyRecord<string, InstalledExtensionRef>,
    AppError
  >;
  readonly getConfiguredPacks: () => Effect.Effect<
    Record.ReadonlyRecord<string, ConfiguredExtensionRef>,
    AppError
  >;
  readonly getUnmanagedPacks: () => Effect.Effect<
    Record.ReadonlyRecord<string, UnmanagedExtensionRef>,
    AppError
  >;
  readonly getInstalledPacks: () => Effect.Effect<
    Record.ReadonlyRecord<string, InstalledExtensionRef>,
    AppError
  >;
  readonly getConfiguredSubagents: () => Effect.Effect<
    Record.ReadonlyRecord<string, ConfiguredSubagent>,
    AppError
  >;
  readonly getInstalledSubagents: () => Effect.Effect<
    Record.ReadonlyRecord<string, InstalledSubagent>,
    AppError
  >;
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
  readonly versionConstraint: Option.Option<string>;
}

/**
 * Arguments for `setExtensionPack` -- all `ExtensionPackLockEntry` fields except `type` (always "registry"),
 * plus an optional version constraint for settings persistence.
 */
export type SetExtensionPackArgs = RegistryExtensionPackLockEntryArgs & {
  /** Version constraint from the original source (e.g. "^2.0.0"). Preserved in settings, not in lockfile. */
  readonly versionConstraint: Option.Option<string>;
};

/**
 * Arguments for `setCommand` -- bundles the command name with the lock entry.
 */
export interface SetCommandArgs {
  readonly name: string;
  readonly lockEntry: CommandLockEntry;
}

/**
 * Arguments for `setSubagent` -- bundles the subagent name with the lock entry.
 */
export interface SetSubagentArgs {
  readonly name: string;
  readonly lockEntry: SubagentLockEntry;
}

/**
 * Arguments for `setMcpServer` -- bundles the MCP server name with the lock entry.
 */
export interface SetMcpServerArgs {
  readonly name: string;
  readonly lockEntry: McpServerLockEntry;
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
  /** Probe lockfile state for policy decisions: ok | missing | invalid. */
  readonly getLockfileState: () => Effect.Effect<LockfileState, AppError>;
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
  /** Resolve owner: project settings -> user-scope settings -> DEFAULT_PROFILE. */
  readonly getConfiguredProfile: () => Effect.Effect<Handle, AppError>;
  /** Resolve owner without fallback: project settings -> user-scope settings -> Option.none(). */
  readonly getDefaultProfile: () => Effect.Effect<Option.Option<Handle>, AppError>;
  /** Append a source to project settings. Invalidates the sources cache. Serialized by semaphore. */
  readonly addConfiguredSource: (source: SourceHostConfig) => Effect.Effect<void, AppError>;
  /** Ignored skill patterns from settings. */
  readonly getIgnoredSkillPatterns: () => Effect.Effect<ReadonlyArray<string>, AppError>;
  /** Read settings and return the configured agent IDs, defaulting to `[]`. */
  readonly getConfiguredAgents: () => Effect.Effect<ReadonlyArray<string>, AppError>;
  /** Read lockfile and return the skills lock map. */
  readonly getLockedSkills: () => Effect.Effect<SkillsLockMap, AppError>;
  /** Read lockfile and return the entry for a specific skill, or Option.none(). */
  readonly getLockedSkill: (name: string) => Effect.Effect<Option.Option<SkillLockEntry>, AppError>;
  /** Compute skill directory paths. If source is omitted, looks up the lock entry to determine source type. */
  readonly getSkillDir: (
    name: string,
    source?: SkillPathSource,
  ) => Effect.Effect<SkillDirPaths, AppError>;
  /** Add or update a skill in both settings and lockfile. Sets updatedAt. Serialized by semaphore. */
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
  /** Atomically rename a skill in both settings and lockfile. Serialized by semaphore. */
  readonly renameSkill: (oldName: string, newName: string) => Effect.Effect<void, AppError>;
  /** Update the agents field on a lock entry. Serialized by semaphore. */
  readonly updateLockEntryAgents: (
    name: string,
    agents: ReadonlyArray<string>,
  ) => Effect.Effect<void, AppError>;
  /** Append an agent ID if not already present and write to disk. Fails with AppError if invalid. Serialized by semaphore. */
  readonly addConfiguredAgent: (agentId: string) => Effect.Effect<void, AppError>;
  readonly getIgnoredCommandPatterns: () => Effect.Effect<ReadonlyArray<string>, AppError>;
  readonly getIgnoredMcpServerPatterns: () => Effect.Effect<ReadonlyArray<string>, AppError>;
  readonly getIgnoredPackPatterns: () => Effect.Effect<ReadonlyArray<string>, AppError>;
  /** Read lockfile and return the packs lock map. */
  readonly getLockedExtensionPacks: () => Effect.Effect<ExtensionPacksLockMap, AppError>;
  /** Read lockfile and return the entry for a specific pack, or Option.none(). */
  readonly getLockedExtensionPack: (
    name: string,
  ) => Effect.Effect<Option.Option<ExtensionPackLockEntry>, AppError>;
  /** Add or update a pack in both settings and lockfile. Sets updatedAt. Serialized by semaphore. */
  readonly setExtensionPack: (args: SetExtensionPackArgs) => Effect.Effect<void, AppError>;
  /** Remove a pack from both settings and lockfile. No-op if absent. Serialized by semaphore. */
  readonly removeExtensionPack: (name: string) => Effect.Effect<void, AppError>;
  /** Compute the pack directory path. Packs are always registry-sourced. */
  readonly getExtensionPackDir: (
    name: string,
    owner: Handle,
  ) => Effect.Effect<ExtensionPackDirPath, AppError>;
  /** Read lockfile and return the commands lock map. */
  readonly getLockedCommands: () => Effect.Effect<CommandsLockMap, AppError>;
  /** Read lockfile and return the entry for a specific command, or Option.none(). */
  readonly getLockedCommand: (
    name: string,
  ) => Effect.Effect<Option.Option<CommandLockEntry>, AppError>;
  /** Add or update a command in both settings and lockfile. Sets updatedAt. Serialized by semaphore. */
  readonly setCommand: (args: SetCommandArgs) => Effect.Effect<void, AppError>;
  /** Add or update a command in lockfile only (skip settings). Used for pack dependencies. Serialized by semaphore. */
  readonly setCommandLock: (args: SetCommandArgs) => Effect.Effect<void, AppError>;
  /** Remove a command from both settings and lockfile. No-op if absent. Serialized by semaphore. */
  readonly removeCommand: (name: string) => Effect.Effect<void, AppError>;
  /** Update a command entry by applying an updater function. Collapses back to settings form. Serialized by semaphore. */
  readonly updateCommandEntry: (
    name: string,
    updater: (entry: CommandEntry) => CommandEntry,
  ) => Effect.Effect<void, AppError>;
  /** Create or overwrite a command entry in settings only (no lockfile). Serialized by semaphore. */
  readonly setCommandEntry: (name: string, entry: CommandEntry) => Effect.Effect<void, AppError>;
  /** Read lockfile and return the subagents lock map. */
  readonly getLockedSubagents: () => Effect.Effect<SubagentsLockMap, AppError>;
  /** Read lockfile and return the entry for a specific subagent, or Option.none(). */
  readonly getLockedSubagent: (
    name: string,
  ) => Effect.Effect<Option.Option<SubagentLockEntry>, AppError>;
  /** Add or update a subagent in both settings and lockfile. Sets updatedAt. Serialized by semaphore. */
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
  /** Add or update an MCP server in both settings and lockfile. Sets updatedAt. Serialized by semaphore. */
  readonly setMcpServer: (args: SetMcpServerArgs) => Effect.Effect<void, AppError>;
  /** Add or update an MCP server in lockfile only (skip settings). Used for pack dependencies. Serialized by semaphore. */
  readonly setMcpServerLock: (args: SetMcpServerArgs) => Effect.Effect<void, AppError>;
  /** Remove an MCP server from both settings and lockfile. No-op if absent. Serialized by semaphore. */
  readonly removeMcpServer: (name: string) => Effect.Effect<void, AppError>;
  // --- Granular removal methods (settings-only or lockfile-only) ---
  /** Remove a skill from lockfile only (keep settings entry). Serialized by semaphore. */
  readonly removeSkillLock: (name: string) => Effect.Effect<void, AppError>;
  /** Remove a command from settings only (keep lockfile entry). Serialized by semaphore. */
  readonly removeCommandSettings: (name: string) => Effect.Effect<void, AppError>;
  /** Remove a command from lockfile only (keep settings entry). Serialized by semaphore. */
  readonly removeCommandLock: (name: string) => Effect.Effect<void, AppError>;
  /** Remove an MCP server from settings only (keep lockfile entry). Serialized by semaphore. */
  readonly removeMcpServerSettings: (name: string) => Effect.Effect<void, AppError>;
  /** Remove an MCP server from lockfile only (keep settings entry). Serialized by semaphore. */
  readonly removeMcpServerLock: (name: string) => Effect.Effect<void, AppError>;
  /** Remove a pack from settings only (keep lockfile entry). Serialized by semaphore. */
  readonly removeExtensionPackSettings: (name: string) => Effect.Effect<void, AppError>;
  /** Remove a pack from lockfile only (keep settings entry). Serialized by semaphore. */
  readonly removeExtensionPackLock: (name: string) => Effect.Effect<void, AppError>;
  // --- Pack dependency queries ---
  /** Check if an extension target is referenced by any installed pack's dependency maps. */
  readonly isExtensionRequiredByInstalledExtensionPack: (
    target: ExtensionTarget,
  ) => Effect.Effect<boolean, AppError>;
  /** Update lockfile entry for a target to indicate it is retained as a pack dependency. No-op if not found. Serialized by semaphore. */
  readonly markDependencyRetainedInLockfile: (
    target: ExtensionTarget,
  ) => Effect.Effect<void, AppError>;
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
>()("axm.sh/WorkspaceMutations") {
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
  /** Explicit project root for project-scope workspaces (defaults to process.cwd()) */
  readonly projectRoot?: string;
  /** Explicit agent IDs to use during initialization (overrides detection and prompting) */
  readonly agents?: ReadonlyArray<string>;
  /** Built-in source host configs (defaults to git forges only when not provided) */
  readonly builtInSources?: ReadonlyArray<SourceHostConfig>;
}

/**
 * Error loading workspace mutations.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type WorkspaceMutationsError = AppError;
