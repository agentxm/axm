/**
 * Failure vocabulary for the extension-workspace layer: the union of the
 * per-module typed families plus the failures the extension-type managers
 * surface from the workspace-state kernel underneath them.
 *
 * Until the source-resolution decoupling wave lands, that integration still
 * fails with the application-owned envelope; producers wrap it in
 * `CoupledDependencyFailure` so the manager contract stays typed, and the
 * application boundary unwraps it verbatim.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Data from "effect/Data";
import type { FqnInvalidError } from "@agentxm/extension-model/unstable/extensions/fqn";
import type { FrontmatterParseFailure } from "@agentxm/registry-protocol/unstable/content/frontmatter";
import type { SubagentContentError } from "@agentxm/registry-protocol/unstable/content/subagent-content";
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
import type { SubagentIoFailed, SubagentManagerError } from "../subagents/errors.js";
import type { WorkspaceSnapshotError } from "@agentxm/workspace-state";
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

/**
 * Interim bridge for producers whose dependencies still fail with the
 * application-owned error envelope: the envelope travels opaquely through
 * kernel-typed channels and the application boundary restores it unchanged,
 * so rendering, exit codes, and machine output stay byte-identical. Call
 * sites dissolve as the integration decoupling waves give those
 * dependencies typed failures.
 */
export class CoupledDependencyFailure extends Data.TaggedError("CoupledDependencyFailure")<{
  readonly failure: unknown;
}> {}

/**
 * Failures the shared subagent sync helpers raise: filesystem steps plus the
 * pre-write workspace snapshot protection.
 */
export type SubagentSyncFailure = SubagentIoFailed | WorkspaceSnapshotError;

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
 * and — until the source-resolution decoupling wave — the
 * opaque `CoupledDependencyFailure` carrying what their still-coupled
 * dependencies construct.
 */
export type ExtensionManagerFailure =
  | CoupledDependencyFailure
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
