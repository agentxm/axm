/**
 * The application boundary's projection of rendered failures into the
 * CLI-facing `AppError` envelope.
 *
 * The workspace kernel renders every typed failure it constructs or carries
 * once, into a `StepFailure`; a plan step settles with the same value. This
 * module recognizes those failures in an untyped channel, projects the
 * rendered failure into the envelope, and adds only what the application
 * itself supplied, so a failure reads the same whether it surfaced here or
 * inside a plan.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { ConfigError } from "effect/Config";

import { FqnInvalidError } from "@agentxm/extension-model/unstable/extensions/fqn";
import { FrontmatterParseFailure, SubagentContentError } from "@agentxm/extension-content";
import { AxmSkillCompatibilityUnavailable } from "@agentxm/cli-maintenance/official-skill/application";
import { AxmSkillIncompatible } from "@agentxm/cli-maintenance/official-skill/domain";
import {
  RegistryOperationFailed,
  RegistryProblem,
  RegistryRequestFailed,
} from "@agentxm/registry-client";
import {
  ApprovalRecoveryMissing,
  CandidateFingerprintFailed,
  LifecyclePostconditionViolated,
  OPERATION_ERROR_CATEGORIES,
  PlanInteractionFailed,
  ScaffoldedExtensionUnresolved,
  StaleExecutionCandidate,
  StepFailure,
} from "@agentxm/workspace/transitions/planning";
import {
  TransitionLockError,
  TransitionLockUnavailable,
  WorkspaceDirectoryError,
  WorkspaceRestorationError,
  WorkspaceRestorationIncomplete,
  WorkspaceSnapshotError,
  WorkspaceTransitionCompromised,
} from "@agentxm/workspace/transitions/settlement";
import {
  AcceptedResolutionMissing,
  CanonicalPathRemovalError,
  ConfiguredAgentOutcomesUnavailable,
  DesiredPackGraphIncomplete,
  InlineExtensionSourceMissing,
  InvalidAgentId,
  LockEntryEndpointConflict,
  LockEntryNameInvalid,
  LockedSkillMissing,
  LockfileDecodeError,
  LockfileIoError,
  LockfileParseError,
  LockfileResolvedVersionInvalid,
  LockfileValidationError,
  LockfileVersionUnsupported,
  LockfileWriteError,
  MaterializedTreeInvalid,
  PackageContentHashFailed,
  PathTraversalDetected,
  SettingsDecodeError,
  SettingsEntryMissing,
  SettingsIoError,
  SettingsParseError,
  SettingsWriteError,
  SkillDiscoveryRootInvalid,
  SubagentScanFailed,
  SupersededCanonicalRemovalFailed,
  SymlinkCreationError,
  WorkspaceLayoutError,
  WorkspaceNotInitialized,
  WorkspaceRootEscape,
  WorkspaceSourceInvalid,
} from "@agentxm/workspace/desired-state";
import {
  ArchiveIntegrityMismatch,
  CanonicalPackageProbeFailed,
  CreateDestinationExists,
  HookDefinitionInvalid,
  HookInstallStateMissing,
  KnowledgeDefinitionInvalid,
  KnowledgeDesiredStateUnreconcilable,
  KnowledgeInstallStateMissing,
  KnowledgeIoFailed,
  KnowledgeObservableContractViolated,
  KnowledgeResolutionMissing,
  KnowledgeUnavailable,
  McpAgentSyncRefused,
  McpCanonicalPathUnsafe,
  McpInstallStateMissing,
  McpLocalNameConflict,
  McpRequiredInputsMissing,
  McpWorkspacePackageInvalid,
  NativeMcpEntryRetirementFailed,
  PackArchiveFetchFailed,
  PackDefinitionInvalid,
  PackInstallStateMissing,
  PackStagingFailed,
  PackageCopyFailed,
  PackageMaterializationFailed,
  RuleDefinitionInvalid,
  RuleInstallStateMissing,
  SkillDefinitionInvalid,
  SkillInstallStateMissing,
  SkillMaterializationFailed,
  StagedPackageInvalid,
  SubagentContentUnreadable,
  SubagentDefinitionInvalid,
  SubagentInstallStateMissing,
} from "@agentxm/workspace/materialization";
import {
  AgentDetectionFailed,
  HookConfigInvalid,
  HookIoFailed,
  McpConfigInvalid,
  McpConfigIoFailed,
  McpDefinitionInvalid,
  McpEntryUnmanaged,
  McpOwnershipMarkerInvalid,
  McpSharedTargetConflict,
  NativeWriteRefused,
  SubagentIoFailed,
  TransientBackupFailed,
  WriteBackupRetained,
} from "@agentxm/workspace/projection/agent-adapters";
import {
  AuthoredContributorUnsupported,
  ContributorIdentityInvalid,
  ContributorTreeMismatch,
  ContributorUnresolved,
  DesiredStateIncomplete,
  InstructionMaintenanceFailed,
  ManagedRegionViolation,
  ProjectionIoFailed,
  ProjectionTargetUnsupported,
} from "@agentxm/workspace/projection";
import {
  AxmSkillGateUnavailable,
  GitOperationFailed,
  SourceHostNotConfigured,
  SourceNetworkFailure,
  SourceNotResolvable,
  SourceSyntaxInvalid,
  WorkspaceCatalogUnavailable,
} from "@agentxm/workspace/resolution/sources";
import {
  ExtensionResolutionFailed,
  PackConstraintShadowed,
  PackDependencyConflict,
  PackDependencyInvalid,
  PackDependencyMissing,
  PackDependencyUnsatisfied,
  SourceAuthorityBlocked,
} from "@agentxm/workspace/resolution";
import {
  AuthoringFailed,
  AuthoringOwnerMismatch,
  AuthoringOwnerRequired,
  AuthoringScopeUnsupported,
  CreateDestinationInspectionFailed,
  CreateNameConfigured,
  ForkPackageConflict,
  ForkPackageFailed,
  ForkPackageInvalid,
  NativeImportConflict,
  NativeImportFailed,
  NativeImportInvalid,
  NativeImportUnsupported,
  PackGraphInvalid,
  PackManifestUnavailable,
  PackMemberAmbiguous,
  PackMemberNotDeclared,
  PackMemberNotFound,
  PackMemberUnmanaged,
  PackNotAuthored,
  PackNotConfigured,
  PackOwnerUnconfigured,
  PackSelectorAmbiguous,
  PackSelectorNotAPack,
  PackSourceMissing,
  ScaffoldNameInvalid,
} from "@agentxm/workspace/authoring";
import {
  ExtensionLifecycleFailed,
  InstallSelectionUnavailable,
} from "@agentxm/workspace/lifecycle";
import {
  SkillSelectionNotFound,
  SkillSelectionUnavailable,
} from "@agentxm/workspace/skills/lifecycle/application";
import {
  SubagentSelectionNotFound,
  SubagentSelectionUnavailable,
} from "@agentxm/workspace/subagents/lifecycle/application";
import { WorkspaceConfigurationFailed } from "@agentxm/workspace/configuration";
import {
  WorkspaceSyncFailed,
  workspaceFailureToStepFailure,
  type WorkspaceFailure,
} from "@agentxm/workspace/reconciliation";

import { AppError, makeAppError, type AppErrorCode } from "./app-error.js";

// The kernel's serialized category vocabulary and the CLI's AppErrorCode must
// stay the same strings; divergence is a compile error here, at the boundary
// that owns the mapping.
OPERATION_ERROR_CATEGORIES satisfies ReadonlyArray<AppErrorCode>;

/** Every class whose instances the kernel renders, recognized in an untyped channel. */
const WORKSPACE_FAILURE_CLASSES = [
  StepFailure,
  ConfigError,
  SettingsIoError,
  SettingsParseError,
  SettingsDecodeError,
  LockfileIoError,
  LockfileParseError,
  LockfileDecodeError,
  LockfileVersionUnsupported,
  WorkspaceRootEscape,
  SettingsWriteError,
  LockfileWriteError,
  LockfileValidationError,
  LockfileResolvedVersionInvalid,
  WorkspaceLayoutError,
  WorkspaceNotInitialized,
  LockedSkillMissing,
  SettingsEntryMissing,
  InvalidAgentId,
  DesiredPackGraphIncomplete,
  CanonicalPathRemovalError,
  SymlinkCreationError,
  LockEntryNameInvalid,
  LockEntryEndpointConflict,
  AcceptedResolutionMissing,
  InlineExtensionSourceMissing,
  SupersededCanonicalRemovalFailed,
  PackageContentHashFailed,
  WorkspaceSourceInvalid,
  SkillDiscoveryRootInvalid,
  SubagentScanFailed,
  MaterializedTreeInvalid,
  PathTraversalDetected,
  ConfiguredAgentOutcomesUnavailable,
  WorkspaceSnapshotError,
  WorkspaceDirectoryError,
  TransitionLockError,
  TransitionLockUnavailable,
  WorkspaceTransitionCompromised,
  WorkspaceRestorationError,
  WorkspaceRestorationIncomplete,
  StaleExecutionCandidate,
  CandidateFingerprintFailed,
  ApprovalRecoveryMissing,
  PlanInteractionFailed,
  LifecyclePostconditionViolated,
  ScaffoldedExtensionUnresolved,
  PackageMaterializationFailed,
  StagedPackageInvalid,
  CanonicalPackageProbeFailed,
  PackageCopyFailed,
  ArchiveIntegrityMismatch,
  CreateDestinationExists,
  RuleDefinitionInvalid,
  RuleInstallStateMissing,
  HookDefinitionInvalid,
  HookInstallStateMissing,
  SubagentDefinitionInvalid,
  SubagentContentUnreadable,
  SubagentInstallStateMissing,
  McpInstallStateMissing,
  McpLocalNameConflict,
  McpCanonicalPathUnsafe,
  McpWorkspacePackageInvalid,
  McpRequiredInputsMissing,
  McpAgentSyncRefused,
  NativeMcpEntryRetirementFailed,
  SkillDefinitionInvalid,
  SkillMaterializationFailed,
  SkillInstallStateMissing,
  AxmSkillCompatibilityUnavailable,
  AxmSkillIncompatible,
  PackDefinitionInvalid,
  PackInstallStateMissing,
  PackArchiveFetchFailed,
  PackStagingFailed,
  KnowledgeDefinitionInvalid,
  KnowledgeIoFailed,
  KnowledgeInstallStateMissing,
  KnowledgeResolutionMissing,
  KnowledgeDesiredStateUnreconcilable,
  KnowledgeUnavailable,
  KnowledgeObservableContractViolated,
  FqnInvalidError,
  FrontmatterParseFailure,
  SubagentContentError,
  AgentDetectionFailed,
  HookConfigInvalid,
  HookIoFailed,
  TransientBackupFailed,
  SubagentIoFailed,
  McpConfigInvalid,
  McpConfigIoFailed,
  McpEntryUnmanaged,
  McpOwnershipMarkerInvalid,
  McpDefinitionInvalid,
  McpSharedTargetConflict,
  NativeWriteRefused,
  WriteBackupRetained,
  DesiredStateIncomplete,
  AuthoredContributorUnsupported,
  ContributorIdentityInvalid,
  ContributorUnresolved,
  ContributorTreeMismatch,
  ProjectionTargetUnsupported,
  ManagedRegionViolation,
  ProjectionIoFailed,
  InstructionMaintenanceFailed,
  SourceSyntaxInvalid,
  SourceHostNotConfigured,
  SourceNotResolvable,
  SourceNetworkFailure,
  GitOperationFailed,
  WorkspaceCatalogUnavailable,
  AxmSkillGateUnavailable,
  RegistryProblem,
  RegistryRequestFailed,
  RegistryOperationFailed,
  ExtensionResolutionFailed,
  SourceAuthorityBlocked,
  PackDependencyInvalid,
  PackDependencyConflict,
  PackConstraintShadowed,
  PackDependencyMissing,
  PackDependencyUnsatisfied,
  AuthoringFailed,
  CreateNameConfigured,
  CreateDestinationInspectionFailed,
  ForkPackageInvalid,
  ForkPackageConflict,
  ForkPackageFailed,
  NativeImportUnsupported,
  NativeImportInvalid,
  NativeImportConflict,
  NativeImportFailed,
  AuthoringOwnerRequired,
  AuthoringOwnerMismatch,
  ScaffoldNameInvalid,
  AuthoringScopeUnsupported,
  PackSelectorNotAPack,
  PackNotConfigured,
  PackSelectorAmbiguous,
  PackSourceMissing,
  PackNotAuthored,
  PackOwnerUnconfigured,
  PackManifestUnavailable,
  PackGraphInvalid,
  PackMemberAmbiguous,
  PackMemberUnmanaged,
  PackMemberNotFound,
  PackMemberNotDeclared,
  ExtensionLifecycleFailed,
  SkillSelectionNotFound,
  SubagentSelectionNotFound,
  SkillSelectionUnavailable,
  SubagentSelectionUnavailable,
  InstallSelectionUnavailable,
  WorkspaceConfigurationFailed,
  WorkspaceSyncFailed,
] as const;

// The recognized classes and the kernel's rendered union must be the same
// set: a family the kernel renders but this boundary cannot recognize, or the
// reverse, is a compile error here.
type RecognizedFailure = InstanceType<(typeof WORKSPACE_FAILURE_CLASSES)[number]>;
const _recognizesEveryRenderedFailure = (failure: WorkspaceFailure): RecognizedFailure => failure;
const _rendersEveryRecognizedFailure = (failure: RecognizedFailure): WorkspaceFailure => failure;
void _recognizesEveryRenderedFailure;
void _rendersEveryRecognizedFailure;

/** Whether an untyped failure is one the workspace kernel renders. */
export const isWorkspaceFailure = (error: unknown): error is WorkspaceFailure =>
  WORKSPACE_FAILURE_CLASSES.some((failureClass) => error instanceof failureClass);

/**
 * Project a rendered failure into the CLI-facing `AppError` envelope: the
 * category is the code, and every rendered field carries over 1:1. The
 * envelope supplies the category's default title where the rendering chose
 * none.
 */
export const stepFailureToAppError = (failure: StepFailure): AppError =>
  makeAppError({
    code: failure.category,
    ...(failure.title === undefined ? {} : { title: failure.title }),
    detail: failure.detail,
    ...(failure.problem === undefined ? {} : { problem: failure.problem }),
    ...(failure.metadata === undefined ? {} : { metadata: failure.metadata }),
    ...(failure.retryable === undefined ? {} : { retryable: failure.retryable }),
    ...(failure.inputs === undefined ? {} : { inputs: failure.inputs }),
    ...(failure.suggestions === undefined ? {} : { suggestions: failure.suggestions }),
    ...(failure.cause === undefined ? {} : { cause: failure.cause }),
  });

/**
 * Convert a workspace failure into the CLI-facing `AppError` envelope. An
 * `AppError` passes through unchanged. A selection the terminal interaction
 * could not obtain carries the interaction's own guidance as its cause, and
 * that guidance is what the terminal prints.
 */
export const toAppError = (error: WorkspaceFailure | AppError): AppError => {
  if (error._tag === "AppError") return error;
  if (
    (error._tag === "SkillSelectionUnavailable" ||
      error._tag === "SubagentSelectionUnavailable" ||
      error._tag === "InstallSelectionUnavailable") &&
    error.cause instanceof AppError
  ) {
    return error.cause;
  }
  return stepFailureToAppError(workspaceFailureToStepFailure(error));
};

/**
 * Convert any failure a command can surface — a workspace failure, an
 * envelope that already travelled the channel, or an unrecognized value —
 * into the CLI-facing `AppError`. An unrecognized value is an internal error.
 */
export const failureToAppError = (failure: unknown): AppError => {
  if (failure instanceof AppError) return failure;
  if (isWorkspaceFailure(failure)) return toAppError(failure);
  return makeAppError({ code: "internal", detail: String(failure), cause: failure });
};
