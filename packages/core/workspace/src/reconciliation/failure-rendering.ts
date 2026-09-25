/**
 * The workspace failure rendering: every typed failure the kernel constructs
 * or carries renders into the one `StepFailure` a plan step settles with and
 * the application boundary projects, so a failure reads the same on both
 * paths.
 *
 * Each family's wording lives once, beside its owner; this module only routes
 * a failure to its family. The reconciliation capability owns the route
 * because its failure-conversion Layer is the boundary adapter every feature
 * plan and the application share.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { ConfigError } from "effect/Config";

import type { WorkspaceStateReadFailure } from "../desired-state/index.js";
import type { WriteBackupRetained } from "../projection/agent-adapters/errors.js";
import type {
  WorkspaceRestorationError,
  WorkspaceRestorationIncomplete,
  WorkspaceTransactionFailure,
} from "../transitions/settlement/errors.js";
import { makeStepFailure, type StepFailure } from "../transitions/planning/plan/errors.js";
import {
  configErrorToStepFailure,
  planExecutionFailureToStepFailure,
  restorationIncompleteToStepFailure,
  workspaceRestorationErrorToStepFailure,
  workspaceStateFailureToStepFailure,
  workspaceStateReadFailureToStepFailure,
  workspaceTransactionFailureToStepFailure,
  type PlanExecutionFailure,
  type WorkspaceStateFailure,
} from "../transitions/planning/plan/step-failure-conversions.js";
import {
  agentIntegrationFailureToStepFailure,
  type AgentIntegrationFailure,
} from "../materialization/agent-integration-step-failure.js";
import {
  projectionErrorToStepFailure,
  type ProjectionFamilyFailure,
} from "../materialization/projection-step-failure.js";
import {
  resolutionFailureToStepFailure,
  type ResolutionFamilyFailure,
} from "../materialization/resolution-step-failure.js";
import {
  materializationFailureToStepFailure,
  type MaterializationFamilyFailure,
} from "../materialization/step-failure.js";
import {
  authoringFailureToStepFailure,
  type AuthoringFamilyFailure,
} from "../authoring/step-failure.js";
import {
  configurationFailedToStepFailure,
  type WorkspaceConfigurationFailed,
} from "../configuration/errors.js";
import {
  lifecycleFailureToStepFailure,
  type LifecycleFamilyFailure,
} from "../lifecycle/step-failure.js";
import {
  publishFailureToStepFailure,
  type PublishFamilyFailure,
} from "../publishing/step-failure.js";

import type { WorkspaceSyncFailed } from "./errors.js";
import { isWorkspaceFailure } from "./failure-recognition.js";

/** Every typed failure the workspace kernel renders. */
export type WorkspaceFailure =
  | StepFailure
  | ConfigError
  | WorkspaceStateReadFailure
  | WorkspaceStateFailure
  | WorkspaceTransactionFailure
  | WorkspaceRestorationError
  | WorkspaceRestorationIncomplete
  | PlanExecutionFailure
  | MaterializationFamilyFailure
  | AgentIntegrationFailure
  | WriteBackupRetained
  | ProjectionFamilyFailure
  | ResolutionFamilyFailure
  | AuthoringFamilyFailure
  | LifecycleFamilyFailure
  | PublishFamilyFailure
  | WorkspaceConfigurationFailed
  | WorkspaceSyncFailed;

/** A retained write backup reads as its inner failure plus where the original survives. */
const writeBackupRetainedFailure = (error: WriteBackupRetained): StepFailure => {
  const inner = workspaceFailureToStepFailure(error.failure);
  return makeStepFailure({
    category: inner.category,
    title: inner.title,
    detail: `${inner.detail}\nOriginal file backup retained at: ${error.backupPath}`,
    problem: inner.problem,
    metadata: inner.metadata,
    retryable: inner.retryable,
    inputs: inner.inputs,
    suggestions: inner.suggestions,
    cause: inner.cause,
  });
};

/** A transition's deciding failure reads as it renders wherever else it surfaces. */
const decidingFailureDetail = (failure: unknown): string | undefined =>
  isWorkspaceFailure(failure) ? workspaceFailureToStepFailure(failure).detail : undefined;

/**
 * Render one workspace failure. A `StepFailure` is already rendered and
 * passes through unchanged.
 */
export const workspaceFailureToStepFailure = (failure: WorkspaceFailure): StepFailure => {
  switch (failure._tag) {
    case "StepFailure":
      return failure;
    case "ConfigError":
      return configErrorToStepFailure(failure);
    case "SettingsIoError":
    case "SettingsParseError":
    case "SettingsDecodeError":
    case "LockfileIoError":
    case "LockfileParseError":
    case "LockfileDecodeError":
    case "LockfileVersionUnsupported":
    case "WorkspaceRootEscape":
      return workspaceStateReadFailureToStepFailure(failure);
    case "SettingsWriteError":
    case "LockfileWriteError":
    case "LockfileValidationError":
    case "LockfileResolvedVersionInvalid":
    case "WorkspaceLayoutError":
    case "WorkspaceNotInitialized":
    case "LockedSkillMissing":
    case "SettingsEntryMissing":
    case "InvalidAgentId":
    case "DesiredPackGraphIncomplete":
    case "CanonicalPathRemovalError":
    case "SymlinkCreationError":
    case "LockEntryNameInvalid":
    case "LockEntryEndpointConflict":
    case "AcceptedResolutionMissing":
    case "InlineExtensionSourceMissing":
    case "SupersededCanonicalRemovalFailed":
    case "PackageContentHashFailed":
    case "WorkspaceSourceInvalid":
    case "SkillDiscoveryRootInvalid":
    case "SubagentScanFailed":
    case "MaterializedTreeInvalid":
    case "PathTraversalDetected":
    case "ConfiguredAgentOutcomesUnavailable":
      return workspaceStateFailureToStepFailure(failure);
    case "WorkspaceSnapshotError":
    case "WorkspaceDirectoryError":
    case "TransitionLockError":
    case "TransitionLockUnavailable":
    case "WorkspaceTransitionCompromised":
      return workspaceTransactionFailureToStepFailure(failure);
    case "WorkspaceRestorationError":
      return workspaceRestorationErrorToStepFailure(failure);
    case "WorkspaceRestorationIncomplete":
      return restorationIncompleteToStepFailure(failure, decidingFailureDetail);
    case "StaleExecutionCandidate":
    case "CandidateFingerprintFailed":
    case "ApprovalRecoveryMissing":
    case "PlanInteractionFailed":
    case "LifecyclePostconditionViolated":
    case "ScaffoldedExtensionUnresolved":
      return planExecutionFailureToStepFailure(failure);
    case "PackageMaterializationFailed":
    case "StagedPackageInvalid":
    case "CanonicalPackageProbeFailed":
    case "PackageCopyFailed":
    case "ArchiveIntegrityMismatch":
    case "CreateDestinationExists":
    case "InstallStateMissing":
    case "RuleDefinitionInvalid":
    case "HookDefinitionInvalid":
    case "SubagentDefinitionInvalid":
    case "SubagentContentUnreadable":
    case "McpInstallStateMissing":
    case "McpLocalNameConflict":
    case "McpCanonicalPathUnsafe":
    case "McpWorkspacePackageInvalid":
    case "McpRequiredInputsMissing":
    case "McpAgentSyncRefused":
    case "NativeMcpEntryRetirementFailed":
    case "SkillDefinitionInvalid":
    case "SkillMaterializationFailed":
    case "AxmSkillCompatibilityUnavailable":
    case "AxmSkillIncompatible":
    case "PackDefinitionInvalid":
    case "PackInstallStateMissing":
    case "PackArchiveFetchFailed":
    case "PackStagingFailed":
    case "KnowledgeDefinitionInvalid":
    case "KnowledgeIoFailed":
    case "KnowledgeResolutionMissing":
    case "KnowledgeDesiredStateUnreconcilable":
    case "KnowledgeUnavailable":
    case "FqnInvalidError":
    case "FrontmatterParseFailure":
    case "SubagentContentError":
      return materializationFailureToStepFailure(failure);
    case "AgentDetectionFailed":
    case "HookConfigInvalid":
    case "HookIoFailed":
    case "TransientBackupFailed":
    case "SubagentIoFailed":
    case "McpConfigInvalid":
    case "McpConfigIoFailed":
    case "McpEntryUnmanaged":
    case "McpOwnershipMarkerInvalid":
    case "McpDefinitionInvalid":
    case "McpSharedTargetConflict":
    case "NativeWriteRefused":
      return agentIntegrationFailureToStepFailure(failure);
    case "WriteBackupRetained":
      return writeBackupRetainedFailure(failure);
    case "DesiredStateIncomplete":
    case "AuthoredContributorUnsupported":
    case "ContributorIdentityInvalid":
    case "ContributorUnresolved":
    case "ContributorTreeMismatch":
    case "ProjectionTargetUnsupported":
    case "ManagedRegionViolation":
    case "ProjectionIoFailed":
    case "InstructionMaintenanceFailed":
      return projectionErrorToStepFailure(failure);
    case "SourceSyntaxInvalid":
    case "SourceHostNotConfigured":
    case "SourceNotResolvable":
    case "SourceNetworkFailure":
    case "GitOperationFailed":
    case "WorkspaceCatalogUnavailable":
    case "AxmSkillGateUnavailable":
    case "RegistryProblem":
    case "RegistryRequestFailed":
    case "RegistryOperationFailed":
    case "ExtensionResolutionFailed":
    case "SourceAuthorityBlocked":
    case "PackDependencyInvalid":
    case "PackDependencyConflict":
    case "PackConstraintShadowed":
    case "PackDependencyMissing":
    case "PackDependencyUnsatisfied":
      return resolutionFailureToStepFailure(failure);
    case "AuthoringFailed":
    case "CreateNameConfigured":
    case "CreateDestinationInspectionFailed":
    case "ForkPackageInvalid":
    case "ForkPackageConflict":
    case "ForkPackageFailed":
    case "NativeImportUnsupported":
    case "NativeImportInvalid":
    case "NativeImportConflict":
    case "NativeImportFailed":
    case "AuthoringOwnerRequired":
    case "AuthoringOwnerMismatch":
    case "ScaffoldNameInvalid":
    case "AuthoringScopeUnsupported":
    case "PackSelectorNotAPack":
    case "PackNotConfigured":
    case "PackSelectorAmbiguous":
    case "PackSourceMissing":
    case "PackNotAuthored":
    case "PackOwnerUnconfigured":
    case "PackManifestUnavailable":
    case "PackGraphInvalid":
    case "PackMemberAmbiguous":
    case "PackMemberUnmanaged":
    case "PackMemberNotFound":
    case "PackMemberNotDeclared":
      return authoringFailureToStepFailure(failure);
    case "ExtensionLifecycleFailed":
    case "InstallSelectionUnavailable":
      return lifecycleFailureToStepFailure(failure);
    case "PublishFailed":
    case "RegistryAccessFailed":
    case "SignedOut":
    case "AuthTokenPolicyRequired":
    case "DeviceLoginDenied":
    case "DeviceLoginCodeExpired":
    case "DeviceAuthorizationPending":
    case "AuthInteractionAbandoned":
    case "AuthExchangeFailed":
      return publishFailureToStepFailure(failure);
    case "WorkspaceConfigurationFailed":
      return configurationFailedToStepFailure(failure);
    case "WorkspaceSyncFailed":
      return makeStepFailure({
        category: failure.category,
        detail: failure.detail,
        suggestions: failure.suggestions,
        cause: failure.cause,
      });
  }
};
