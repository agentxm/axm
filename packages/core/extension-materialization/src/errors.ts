/**
 * Failure vocabulary for extension materialization: the union of the per-type
 * manager families, the canonical-materialization family, and the failures the
 * managers surface from the capabilities underneath them — workspace state,
 * transactions, projection, source resolution, and the registry client.
 *
 * Every member is typed. Nothing travels opaquely: a manager that calls a
 * source host or the registry client keeps that integration's own failure in
 * its channel, and the application boundary converts it once.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { FqnInvalidError } from "@agentxm/extension-model/unstable/extensions/fqn";
import type { FrontmatterParseFailure, SubagentContentError } from "@agentxm/extension-content";
import type { MaterializationError } from "./extensions/errors.js";
import type { SourceAuthorityBlocked } from "@agentxm/extension-resolution";
import type { SourceResolutionFailure } from "@agentxm/extension-sources";
import type { RegistryClientFailure } from "@agentxm/registry-client";
import type { InstructionMaintenanceFailed, ProjectionError } from "@agentxm/workspace-projection";
import type { MaterializedTreeInvalid } from "@agentxm/workspace-state";
import type {
  WorkspaceTransactionFailure,
  WorkspaceRestorationIncomplete,
} from "@agentxm/workspace-transactions";
import type {
  WorkspaceStateMutationFailure,
  WorkspaceStateReadFailure,
} from "@agentxm/workspace-state";
import type { CodingAgentFailure } from "@agentxm/agent-integration";
import type { RuleManagerError } from "./rules/errors.js";
import type { HookManagerError } from "./hooks/errors.js";
import type { SubagentManagerError } from "./subagents/errors.js";
import type { McpManagerError } from "./mcps/errors.js";
import type { SkillManagerError } from "./skills/errors.js";
import type { PackManagerError } from "./packs/errors.js";
import type { KnowledgeManagerError } from "./knowledge/errors.js";
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

/** Every typed failure the materialization modules construct themselves. */
export type ExtensionMaterializationError =
  | MaterializationError
  | SourceAuthorityBlocked
  | ProjectionError
  | InstructionMaintenanceFailed
  | RuleManagerError
  | HookManagerError
  | SubagentManagerError
  | McpManagerError
  | SkillManagerError
  | PackManagerError
  | KnowledgeManagerError
  | MaterializedTreeInvalid;

/**
 * Every failure an extension-type manager method may surface: the
 * materialization families, the capability families underneath them, and the
 * integration families their acquisition steps carry through.
 */
export type ExtensionManagerFailure =
  | CodingAgentFailure
  | ExtensionMaterializationError
  | SourceResolutionFailure
  | RegistryClientFailure
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
