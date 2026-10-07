import { registryFailureDiagnostic } from "./failure-diagnostic.js";
/**
 * The kernel failure rendering: every typed failure the workspace kernel
 * constructs or carries renders into the one `StepFailure` a plan step settles
 * with and the application boundary projects, so a failure reads the same on
 * both paths.
 *
 * Each family's wording lives once, beside its owner; this module only
 * recognizes a kernel failure and routes it to its family. A failure an
 * extension kind constructs renders structurally from the rendering data its
 * brand carries, so the kernel names no kind. Feature families render beside
 * their features, and the application composes them with this rendering into
 * its one catalog.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { ConfigError } from "effect/Config";
import { NativeLocationError } from "../locations/index.js";

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
  AuthExchangeFailed,
  AuthInteractionAbandoned,
  AuthTokenPolicyRequired,
  DeviceAuthorizationPending,
  DeviceLoginCodeExpired,
  DeviceLoginDenied,
  RegistryAccessFailed,
  SignedOut,
  WorkloadTokenUnavailable,
  type RegistryAccessFailure,
} from "@agentxm/registry-access/authentication";

import {
  type WorkspaceStateReadFailure,
  configErrorToStepFailure,
  restorationIncompleteToStepFailure,
  workspaceRestorationErrorToStepFailure,
  workspaceStateFailureToStepFailure,
  workspaceStateReadFailureToStepFailure,
  workspaceTransactionFailureToStepFailure,
  type WorkspaceStateFailure,
  LockfileResolvedVersionInvalid,
  LockfileValidationError,
  LockfileWriteError,
  RuntimeIgnoreWriteError,
  SettingsWriteError,
  PathTraversalDetected,
  ConfiguredAgentOutcomesUnavailable,
  AcceptedResolutionMissing,
  CanonicalPathRemovalError,
  DesiredPackGraphIncomplete,
  InlineExtensionSourceMissing,
  InvalidAgentId,
  LockEntryEndpointConflict,
  LockEntryNameInvalid,
  LockedSkillMissing,
  PackageContentHashFailed,
  SettingsEntryMissing,
  SupersededCanonicalRemovalFailed,
  SymlinkCreationError,
  WorkspaceLayoutError,
  WorkspaceNotInitialized,
  WorkspaceSourceInvalid,
  MaterializedTreeInvalid,
  LockfileDecodeError,
  LockfileIoError,
  LockfileParseError,
  LockfileVersionUnsupported,
  SettingsDecodeError,
  SettingsIoError,
  SettingsParseError,
  SkillDiscoveryRootInvalid,
  SubagentScanFailed,
  WorkspaceRootEscape,
} from "../workspace-state/index.js";
import {
  InstallStateMissing,
  isExtensionKindFailure,
  type ExtensionKindFailure,
  agentIntegrationFailureToStepFailure,
  type AgentIntegrationFailure,
  materializationFailureToStepFailure,
  type MaterializationFamilyFailure,
} from "../materialization/index.js";
import {
  ApprovalRecoveryMissing,
  CandidateFingerprintFailed,
  ExtensionLifecycleFailed,
  InstallSelectionUnavailable,
  LifecyclePostconditionViolated,
  PlanInteractionFailed,
  ScaffoldedExtensionUnresolved,
  StaleExecutionCandidate,
  StepFailure,
  makeStepFailure,
} from "../operations/index.js";
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
  SubagentIoFailed,
  WriteBackupRetained,
  NativeWriteRefused,
  TransientBackupFailed,
} from "../agent-adapters/index.js";
import {
  AuthoredContributorUnsupported,
  ContributorIdentityInvalid,
  ContributorTreeMismatch,
  ContributorUnresolved,
  DesiredStateIncomplete,
  ManagedRegionViolation,
  ProjectionIoFailed,
  ProjectionTargetUnsupported,
  InstructionMaintenanceFailed,
  projectionErrorToStepFailure,
  type ProjectionFamilyFailure,
} from "../projection/index.js";
import {
  ExtensionResolutionFailed,
  PackConstraintShadowed,
  PackDependencyConflict,
  PackDependencyInvalid,
  PackDependencyMissing,
  PackDependencyUnsatisfied,
  SourceAuthorityBlocked,
} from "../resolution/index.js";
import {
  AxmSkillGateUnavailable,
  GitOperationFailed,
  SourceHostNotConfigured,
  SourceNetworkFailure,
  SourceNotResolvable,
  SourceSyntaxInvalid,
  WorkspaceCatalogUnavailable,
} from "../sources/index.js";
import {
  TransitionLockError,
  TransitionLockUnavailable,
  WorkspaceDirectoryError,
  WorkspaceRestorationError,
  WorkspaceRestorationIncomplete,
  WorkspaceSnapshotError,
  WorkspaceTransitionCompromised,
  type WorkspaceTransactionFailure,
} from "../settlement/index.js";
import {
  planExecutionFailureToStepFailure,
  type PlanExecutionFailure,
  resolutionFailureToStepFailure,
  type ResolutionFamilyFailure,
} from "../planning/index.js";

import { WorkspaceSyncFailed } from "./errors.js";
import { registryAccessFailureToStepFailure } from "./registry-access-step-failure.js";
import {
  ArchiveIntegrityMismatch,
  CanonicalPackageProbeFailed,
  CreateDestinationExists,
  PackageCopyFailed,
  PackageMaterializationFailed,
  StagedPackageInvalid,
} from "../acquisition/index.js";

/** Every typed failure the workspace kernel constructs or carries. */
export type KernelFailure =
  | StepFailure
  | NativeLocationError
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
  | RegistryAccessFailure
  | ExtensionLifecycleFailed
  | InstallSelectionUnavailable
  | WorkspaceSyncFailed;

/**
 * Every kernel class whose instances this module renders. The list is built
 * when a failure is recognized, not at module load: several of these modules
 * render through this capability, so their classes are read only after every
 * module has loaded. A failure an extension kind constructs is recognized by
 * its brand instead.
 */
const kernelFailureClasses = () =>
  [
    StepFailure,
    NativeLocationError,
    ConfigError,
    SettingsIoError,
    SettingsParseError,
    SettingsDecodeError,
    LockfileIoError,
    LockfileParseError,
    LockfileDecodeError,
    LockfileVersionUnsupported,
    WorkspaceRootEscape,
    RuntimeIgnoreWriteError,
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
    InstallStateMissing,
    AxmSkillCompatibilityUnavailable,
    AxmSkillIncompatible,
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
    RegistryAccessFailed,
    SignedOut,
    AuthTokenPolicyRequired,
    DeviceLoginDenied,
    DeviceLoginCodeExpired,
    DeviceAuthorizationPending,
    AuthInteractionAbandoned,
    AuthExchangeFailed,
    WorkloadTokenUnavailable,
    ExtensionLifecycleFailed,
    InstallSelectionUnavailable,
    WorkspaceSyncFailed,
  ] as const;

// The recognized failures and the rendered union are the same set: a family
// the kernel renders but cannot recognize, or the reverse, is a compile error
// here.
type RecognizedFailure =
  InstanceType<ReturnType<typeof kernelFailureClasses>[number]> | ExtensionKindFailure;
const _recognizesEveryRenderedFailure = (failure: KernelFailure): RecognizedFailure => failure;
const _rendersEveryRecognizedFailure = (failure: RecognizedFailure): KernelFailure => failure;
void _recognizesEveryRenderedFailure;
void _rendersEveryRecognizedFailure;

/** Whether an untyped failure is one the workspace kernel renders. */
export const isKernelFailure = (failure: unknown): failure is KernelFailure =>
  isExtensionKindFailure(failure) ||
  kernelFailureClasses().some((failureClass) => failure instanceof failureClass);

/**
 * What a rendering needs from its composer: the sentence a transition's
 * deciding failure reads with. The kernel reads its own families; a composer
 * that also renders feature families supplies a reader over all of them.
 */
export interface KernelFailureRendering {
  readonly detailOf: (failure: unknown) => string | undefined;
}

/** A retained write backup reads as its inner failure plus where the original survives. */
const writeBackupRetainedFailure = (
  error: WriteBackupRetained,
  rendering: KernelFailureRendering,
): StepFailure => {
  const inner = renderKernelFailure(error.cause, rendering);
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

/**
 * Render one kernel failure within a composer's rendering. A `StepFailure` is
 * already rendered and passes through unchanged.
 */
const renderKernelFailureDetails = (
  failure: KernelFailure,
  rendering: KernelFailureRendering,
): StepFailure => {
  if (isExtensionKindFailure(failure)) return materializationFailureToStepFailure(failure);
  switch (failure._tag) {
    case "StepFailure":
      return failure;
    case "NativeLocationError":
      return makeStepFailure({
        category: failure.reason === "unreadable" ? "unavailable" : "conflict",
        detail: `Native location ${failure.target} could not be used: ${failure.reason}`,
        cause: failure,
      });
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
    case "RuntimeIgnoreWriteError":
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
      return restorationIncompleteToStepFailure(failure, rendering.detailOf);
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
    case "AxmSkillCompatibilityUnavailable":
    case "AxmSkillIncompatible":
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
      return writeBackupRetainedFailure(failure, rendering);
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
    case "RegistryAccessFailed":
    case "SignedOut":
    case "AuthTokenPolicyRequired":
    case "DeviceLoginDenied":
    case "DeviceLoginCodeExpired":
    case "DeviceAuthorizationPending":
    case "AuthInteractionAbandoned":
    case "AuthExchangeFailed":
    case "WorkloadTokenUnavailable":
      return registryAccessFailureToStepFailure(failure);
    case "ExtensionLifecycleFailed":
      return makeStepFailure({
        category: failure.category,
        title: failure.title,
        detail: failure.detail,
        metadata: failure.metadata,
        retryable: failure.retryable,
        recover: failure.recover,
        cmd: failure.cmd,
        suggestions: failure.suggestions,
        cause: failure.cause,
      });
    case "InstallSelectionUnavailable":
      return makeStepFailure({
        category: "usage",
        detail: "Unable to obtain an extension selection",
        recover:
          "Name the extensions with their per-type flags, take them all with --all, or use an interactive terminal.",
        cause: failure.cause,
      });
    case "WorkspaceSyncFailed":
      return makeStepFailure({
        category: failure.category,
        detail: failure.detail,
        suggestions: failure.suggestions,
        cause: failure.cause,
      });
  }
};

/** The sentence a kernel failure reads with, or none for a failure the kernel does not render. */
export const kernelFailureDetail = (failure: unknown): string | undefined =>
  isKernelFailure(failure) ? kernelFailureToStepFailure(failure).detail : undefined;

/**
 * Render one kernel failure on its own, where the kernel's families are every
 * failure the caller can carry.
 */
export const kernelFailureToStepFailure = (failure: KernelFailure): StepFailure =>
  renderKernelFailure(failure, { detailOf: kernelFailureDetail });

/** Keep the known producer identity on every serialized and direct rendering. */
export const renderKernelFailure = (
  failure: KernelFailure,
  rendering: KernelFailureRendering,
): StepFailure => {
  const rendered = renderKernelFailureDetails(failure, rendering);
  if (rendered.diagnostic !== undefined)
    return failure instanceof StepFailure
      ? rendered
      : new StepFailure({ ...rendered, cause: failure });
  const registry =
    failure instanceof RegistryProblem ||
    failure instanceof RegistryRequestFailed ||
    failure instanceof RegistryOperationFailed
      ? registryFailureDiagnostic(failure)
      : undefined;
  const producer = kernelFailureClasses().find((constructor) => failure instanceof constructor);
  const kind =
    producer === undefined
      ? "extension.kind-failure"
      : "_tag" in failure && typeof failure._tag === "string"
        ? failure._tag.replace(/([a-z0-9])([A-Z])/gu, "$1-$2").toLowerCase()
        : "diagnostic.unclassified";
  return new StepFailure({
    ...rendered,
    cause: failure instanceof StepFailure ? failure.cause : failure,
    diagnostic: registry ?? {
      kind: failure instanceof StepFailure ? "diagnostic.unclassified" : kind,
      operation: "workspace.operation",
    },
  });
};
