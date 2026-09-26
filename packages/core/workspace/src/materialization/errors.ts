/**
 * Failure vocabulary for extension materialization: the extension-kind
 * failures the per-type managers construct, the canonical-materialization
 * family, and the failures the managers surface from the capabilities
 * underneath them — workspace state, transactions, projection, source
 * resolution, and the registry client.
 *
 * Every member is typed. Nothing travels opaquely: a manager that calls a
 * source host or the registry client keeps that integration's own failure in
 * its channel, and the application boundary converts it once.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { FqnInvalidError } from "@agentxm/extension-model/unstable/extensions/fqn";
import type { FrontmatterParseFailure, SubagentContentError } from "@agentxm/extension-content";
import type { AxmSkillCompatibilityUnavailable } from "@agentxm/cli-maintenance/official-skill/application";
import type { AxmSkillIncompatible } from "@agentxm/cli-maintenance/official-skill/domain";
import type { LifecyclePostconditionViolated } from "../operations/index.js";
import type { MaterializationError } from "../acquisition/errors.js";
import type {
  PackDependencyResolutionFailure,
  SourceAuthorityBlocked,
} from "../resolution/index.js";
import type { SourceResolutionFailure } from "../resolution/sources/index.js";
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
import type { CodingAgentFailure } from "../projection/agent-adapters/index.js";
import type {
  AcceptedResolutionMissing,
  CanonicalPathRemovalError,
  DesiredPackGraphIncomplete,
  InlineExtensionSourceMissing,
  InvalidAgentId,
  LockedSkillMissing,
  LockEntryEndpointConflict,
  LockEntryNameInvalid,
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
import type { InstallStateMissing } from "./accepted-resolution.js";
import type { ExtensionKindFailure } from "./kind-failure.js";

/**
 * Every typed failure materialization constructs: the kernel's own families
 * and any failure an extension kind constructs under the kernel's brand.
 */
export type ExtensionMaterializationError =
  | MaterializationError
  | InstallStateMissing
  | LifecyclePostconditionViolated
  | SourceAuthorityBlocked
  | ProjectionError
  | InstructionMaintenanceFailed
  | ExtensionKindFailure
  | MaterializedTreeInvalid;

/**
 * Every failure an extension-type manager method may surface: the
 * materialization families, the capability families underneath them, the
 * integration families their acquisition steps carry through, the official
 * AXM skill's compatibility refusals, and pack dependency resolution.
 */
export type ExtensionManagerFailure =
  | CodingAgentFailure
  | AxmSkillCompatibilityUnavailable
  | AxmSkillIncompatible
  | PackDependencyResolutionFailure
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
  | LockEntryNameInvalid
  | LockEntryEndpointConflict
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
