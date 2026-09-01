/**
 * Failure vocabulary for the extension-workspace layer: the union of the
 * per-module typed families plus the failures the extension-type managers
 * surface from the workspace-state kernel underneath them.
 *
 * `ExtensionManagerFailure` still carries `AppError` while the registry and
 * source-resolution integrations construct it; their decoupling waves remove
 * that member without changing the manager contract again.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Data from "effect/Data";
import type { FqnInvalidError } from "@agentxm/extension-model/unstable/extensions/fqn";
import type { FrontmatterParseFailure } from "@agentxm/registry-protocol/unstable/content/frontmatter";
import type { SubagentContentError } from "@agentxm/registry-protocol/unstable/content/subagent-content";
import type { AppError } from "../app-error/index.js";
import type { ExtensionsError } from "../extensions/errors.js";
import type { ProjectionError } from "../projection/errors.js";
import type { MaterializedTreeInvalid } from "@agentxm/workspace-state";
import type {
  WorkspaceTransactionFailure,
  WorkspaceRestorationIncomplete,
} from "@agentxm/workspace-state";
import type {
  WorkspaceStateMutationFailure,
  WorkspaceStateReadFailure,
} from "@agentxm/workspace-state";
import type { TransientBackupFailed } from "../utils/transient-backup.js";
import type { RuleManagerError } from "../rules/errors.js";
import type { HookManagerError } from "../hooks/errors.js";
import type { SubagentManagerError } from "../subagents/errors.js";
import type { McpManagerError } from "../mcps/errors.js";
import type { SkillManagerError } from "../skills/errors.js";
import type { PackManagerError } from "../packs/errors.js";
import type { KnowledgeManagerError } from "../knowledge/errors.js";
import type {
  AcceptedResolutionMissing,
  CanonicalPathRemovalError,
  DesiredPackGraphIncomplete,
  InlineExtensionSourceMissing,
  InvalidAgentId,
  LockedSkillMissing,
  LockEntryEndpointConflict,
  LockEntryNameInvalid,
  LockEntrySourceMissing,
  LockEntrySourceTypeConflict,
  LockEntryUrlInvalid,
  PackageContentHashFailed,
  SettingsEntryMissing,
  SupersededCanonicalRemovalFailed,
  SymlinkCreationError,
  WorkspaceLayoutError,
  WorkspaceNotInitialized,
  WorkspaceSourceInvalid,
} from "@agentxm/workspace-state";
import type { SkillDiscoveryRootInvalid, SubagentScanFailed } from "@agentxm/workspace-state";
import type { LockfileResolvedVersionInvalid } from "@agentxm/workspace-state";

/**
 * A managed-file write failed after its pre-write backup was taken; the
 * original content survives at `backupPath`.
 */
export class WriteBackupRetained extends Data.TaggedError("WriteBackupRetained")<{
  readonly backupPath: string;
  readonly failure: ExtensionManagerFailure;
}> {}

/** Every typed failure the extension-workspace modules construct. */
export type ExtensionWorkspaceError =
  | ExtensionsError
  | ProjectionError
  | RuleManagerError
  | HookManagerError
  | SubagentManagerError
  | McpManagerError
  | SkillManagerError
  | PackManagerError
  | KnowledgeManagerError
  | MaterializedTreeInvalid
  | TransientBackupFailed
  | WriteBackupRetained;

/**
 * Every failure an extension-type manager method may surface: the
 * extension-workspace families, the workspace-state families underneath them,
 * and — until the registry and source-resolution decoupling waves — the
 * CLI-facing `AppError` their still-coupled dependencies construct.
 */
export type ExtensionManagerFailure =
  | AppError
  | ExtensionWorkspaceError
  | WorkspaceStateReadFailure
  | WorkspaceStateMutationFailure
  | WorkspaceTransactionFailure
  | WorkspaceRestorationIncomplete
  | WorkspaceLayoutError
  | WorkspaceNotInitialized
  | LockedSkillMissing
  | SettingsEntryMissing
  | InvalidAgentId
  | DesiredPackGraphIncomplete
  | CanonicalPathRemovalError
  | SymlinkCreationError
  | LockEntrySourceMissing
  | LockEntryUrlInvalid
  | LockEntryNameInvalid
  | LockEntryEndpointConflict
  | LockEntrySourceTypeConflict
  | AcceptedResolutionMissing
  | InlineExtensionSourceMissing
  | SupersededCanonicalRemovalFailed
  | PackageContentHashFailed
  | WorkspaceSourceInvalid
  | SkillDiscoveryRootInvalid
  | SubagentScanFailed
  | LockfileResolvedVersionInvalid
  | FqnInvalidError
  | FrontmatterParseFailure
  | SubagentContentError;
