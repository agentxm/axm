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
import type { LifecyclePostconditionViolated } from "../transitions/planning/index.js";
import type { MaterializationError } from "../acquisition/errors.js";
import type { SourceAuthorityBlocked } from "../resolution/index.js";
import type { SourceResolutionFailure } from "@agentxm/extension-sources";
import type { RegistryClientFailure } from "@agentxm/registry-client";
import type { InstructionMaintenanceFailed, ProjectionError } from "../projection/index.js";
import type { MaterializedTreeInvalid } from "../desired-state/index.js";
import type {
  WorkspaceTransactionFailure,
  WorkspaceRestorationIncomplete,
} from "../transitions/settlement/index.js";
import type {
  WorkspaceStateMutationFailure,
  WorkspaceStateReadFailure,
} from "../desired-state/index.js";
import type { CodingAgentFailure } from "@agentxm/agent-integration";
import type { RuleManagerError } from "../instructions/errors.js";
import type { HookManagerError } from "../hooks/errors.js";
import type { SubagentManagerError } from "../subagents/errors.js";
import type { McpManagerError } from "../mcp-connections/errors.js";
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
} from "../desired-state/index.js";
import type { SkillDiscoveryRootInvalid, SubagentScanFailed } from "../desired-state/index.js";
import type { LockfileResolvedVersionInvalid } from "../desired-state/index.js";

/** Every typed failure the materialization modules construct themselves. */
export type ExtensionMaterializationError =
  | MaterializationError
  | LifecyclePostconditionViolated
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
