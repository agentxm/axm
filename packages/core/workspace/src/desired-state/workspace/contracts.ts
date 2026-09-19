/** Shared workspace-state operation types and failure unions. */

import type * as Effect from "effect/Effect";
import type * as Option from "effect/Option";

import type { WorkspaceSnapshotError } from "../../transitions/settlement/index.js";
import type {
  LockfileReadError,
  SettingsReadError,
  WorkspaceRootEscape,
} from "./read-model/errors.js";
import type { SettingsWriteError } from "../settings/errors.js";
import type { LockfileValidationError, LockfileWriteError } from "../lockfile/errors.js";
import type { WorkspaceLayoutError, WorkspaceNotInitialized } from "./errors.js";
import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import type {
  PackLockEntry,
  HookLockEntry,
  KnowledgeLockEntry,
  McpServerLockEntry,
  RuleLockEntry,
  SkillLockEntry,
  SubagentLockEntry,
} from "../lockfile/index.js";
import type { SourceHostConfig } from "../settings/index.js";
import type { ReadModelRecordRow } from "./read-model-record-types.js";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import type { ExtensionInventory } from "./read-model/extensions/inventory.js";
import type { AbsolutePath } from "@agentxm/extension-model/unstable/path-types";
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
  | WorkspaceLockfileReadFailure
  | LockfileValidationError
  | LockfileWriteError
  | WorkspaceSnapshotError;

/** Coupled settings-and-lockfile mutation. */
export type WorkspaceStateMutationFailure =
  WorkspaceSettingsMutationFailure | WorkspaceLockfileMutationFailure;

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
 * Arguments for `setPack` plus an optional version constraint for settings persistence.
 */
export type SetPackArgs = PackLockEntry & {
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
  /** Canonical source-resolution key. Unlike name, this is not connection-scoped. */
  readonly resolutionKey: string;
  readonly lockEntry: McpServerLockEntry;
  readonly versionRange: Option.Option<string>;
  readonly env?: Readonly<Record<string, string>>;
  readonly enabled?: boolean;
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

/** Options for locating and initializing one workspace scope. */
export interface WorkspaceStateOptions {
  /** Whether to use the user workspace or a project workspace. */
  readonly scope: WorkspaceScope;
  /** Canonical project root supplied by the transport boundary. */
  readonly projectRoot: AbsolutePath;
  /** Explicit agent IDs to use during initialization (overrides detection and prompting). */
  readonly agents?: ReadonlyArray<string>;
  /** Auto-accept setup defaults and confirmations. */
  readonly yes?: boolean;
  /** Suppress interactive setup prompts; the transport boundary resolves flag/CI/TTY. */
  readonly nonInteractive?: boolean;
  /** Compute the setup plan without writing files. */
  readonly preview?: boolean;
  /** Built-in source host configs (defaults to git forges only when not provided). */
  readonly builtInSources?: ReadonlyArray<SourceHostConfig>;
  /** Allow read-only inspection when settings are absent. */
  readonly allowUninitialized?: boolean;
}

/** Errors locating a workspace and reading its authoritative state. */
export type WorkspaceStateError =
  | WorkspaceSettingsReadFailure
  | WorkspaceLockfileReadFailure
  | WorkspaceLayoutError
  | WorkspaceNotInitialized;
