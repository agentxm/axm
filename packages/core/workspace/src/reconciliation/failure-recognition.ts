/**
 * Recognition of the typed failures the workspace kernel renders, for an
 * untyped channel such as a transition cause or an application boundary.
 *
 * The recognized classes and the rendered union are the same set: a family
 * the kernel renders but cannot recognize, or the reverse, is a compile error
 * here.
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
  AuthExchangeFailed,
  AuthInteractionAbandoned,
  AuthTokenPolicyRequired,
  DeviceAuthorizationPending,
  DeviceLoginCodeExpired,
  DeviceLoginDenied,
  RegistryAccessFailed,
  SignedOut,
} from "@agentxm/registry-access/authentication";

import {
  ArchiveIntegrityMismatch,
  CanonicalPackageProbeFailed,
  CreateDestinationExists,
  PackageCopyFailed,
  PackageMaterializationFailed,
  StagedPackageInvalid,
} from "../acquisition/errors.js";
import {
  CreateDestinationInspectionFailed,
  CreateNameConfigured,
  ForkPackageConflict,
  ForkPackageFailed,
  ForkPackageInvalid,
  NativeImportConflict,
  NativeImportFailed,
  NativeImportInvalid,
  NativeImportUnsupported,
} from "../authoring/authored-package-errors.js";
import {
  AuthoringOwnerMismatch,
  AuthoringOwnerRequired,
  AuthoringScopeUnsupported,
  ScaffoldNameInvalid,
} from "../authoring/create/errors.js";
import { AuthoringFailed } from "../authoring/errors.js";
import { WorkspaceConfigurationFailed } from "../configuration/errors.js";
import {
  LockfileResolvedVersionInvalid,
  LockfileValidationError,
  LockfileWriteError,
} from "../desired-state/lockfile/errors.js";
import { SettingsWriteError } from "../desired-state/settings/errors.js";
import { PathTraversalDetected } from "../desired-state/utils/path-safety.js";
import { ConfiguredAgentOutcomesUnavailable } from "../desired-state/workspace/configured-agent-outcomes-provider.js";
import {
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
} from "../desired-state/workspace/errors.js";
import { MaterializedTreeInvalid } from "../desired-state/workspace/materialized-tree.js";
import {
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
} from "../desired-state/workspace/read-model/errors.js";
import { HookDefinitionInvalid } from "../hooks/errors.js";
import { RuleDefinitionInvalid } from "../instructions/errors.js";
import { InstallStateMissing } from "../materialization/accepted-resolution.js";
import {
  KnowledgeDefinitionInvalid,
  KnowledgeDesiredStateUnreconcilable,
  KnowledgeIoFailed,
  KnowledgeResolutionMissing,
  KnowledgeUnavailable,
} from "../knowledge/errors.js";
import { ExtensionLifecycleFailed } from "../lifecycle/errors.js";
import { InstallSelectionUnavailable } from "../lifecycle/install/selection.js";
import {
  McpAgentSyncRefused,
  McpCanonicalPathUnsafe,
  McpInstallStateMissing,
  McpLocalNameConflict,
  McpRequiredInputsMissing,
  McpWorkspacePackageInvalid,
} from "../mcp-connections/errors.js";
import { NativeMcpEntryRetirementFailed } from "../mcp-connections/native-entry.js";
import {
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
} from "../packs/authoring/membership-errors.js";
import {
  PackArchiveFetchFailed,
  PackDefinitionInvalid,
  PackInstallStateMissing,
  PackStagingFailed,
} from "../packs/errors.js";
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
} from "../projection/agent-adapters/errors.js";
import { NativeWriteRefused } from "../projection/agent-adapters/native-write-authority.js";
import { PublishFailed } from "../publishing/errors.js";
import { TransientBackupFailed } from "../projection/agent-adapters/transient-backup.js";
import {
  AuthoredContributorUnsupported,
  ContributorIdentityInvalid,
  ContributorTreeMismatch,
  ContributorUnresolved,
  DesiredStateIncomplete,
  ManagedRegionViolation,
  ProjectionIoFailed,
  ProjectionTargetUnsupported,
} from "../projection/errors.js";
import { InstructionMaintenanceFailed } from "../projection/instructions/errors.js";
import { WorkspaceSyncFailed } from "./errors.js";
import {
  ExtensionResolutionFailed,
  PackConstraintShadowed,
  PackDependencyConflict,
  PackDependencyInvalid,
  PackDependencyMissing,
  PackDependencyUnsatisfied,
  SourceAuthorityBlocked,
} from "../resolution/errors.js";
import { AxmSkillGateUnavailable } from "../resolution/sources/axm-skill-gate.js";
import {
  GitOperationFailed,
  SourceHostNotConfigured,
  SourceNetworkFailure,
  SourceNotResolvable,
  SourceSyntaxInvalid,
} from "../resolution/sources/errors.js";
import { WorkspaceCatalogUnavailable } from "../resolution/sources/workspace-catalog.js";
import { SkillDefinitionInvalid, SkillMaterializationFailed } from "../skills/errors.js";
import { SubagentContentUnreadable, SubagentDefinitionInvalid } from "../subagents/errors.js";
import {
  LifecyclePostconditionViolated,
  ScaffoldedExtensionUnresolved,
} from "../transitions/planning/materialization-errors.js";
import {
  ApprovalRecoveryMissing,
  CandidateFingerprintFailed,
  PlanInteractionFailed,
  StaleExecutionCandidate,
  StepFailure,
} from "../transitions/planning/plan/errors.js";
import {
  TransitionLockError,
  TransitionLockUnavailable,
  WorkspaceDirectoryError,
  WorkspaceRestorationError,
  WorkspaceRestorationIncomplete,
  WorkspaceSnapshotError,
  WorkspaceTransitionCompromised,
} from "../transitions/settlement/errors.js";
import type { WorkspaceFailure } from "./failure-rendering.js";

/**
 * Every class whose instances the kernel renders. The list is built when a
 * failure is recognized, not at module load: several of these modules render
 * through this capability, so their classes are read only after every module
 * has loaded.
 */
const workspaceFailureClasses = () =>
  [
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
    InstallStateMissing,
    RuleDefinitionInvalid,
    HookDefinitionInvalid,
    SubagentDefinitionInvalid,
    SubagentContentUnreadable,
    McpInstallStateMissing,
    McpLocalNameConflict,
    McpCanonicalPathUnsafe,
    McpWorkspacePackageInvalid,
    McpRequiredInputsMissing,
    McpAgentSyncRefused,
    NativeMcpEntryRetirementFailed,
    SkillDefinitionInvalid,
    SkillMaterializationFailed,
    AxmSkillCompatibilityUnavailable,
    AxmSkillIncompatible,
    PackDefinitionInvalid,
    PackInstallStateMissing,
    PackArchiveFetchFailed,
    PackStagingFailed,
    KnowledgeDefinitionInvalid,
    KnowledgeIoFailed,
    KnowledgeResolutionMissing,
    KnowledgeDesiredStateUnreconcilable,
    KnowledgeUnavailable,
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
    InstallSelectionUnavailable,
    PublishFailed,
    RegistryAccessFailed,
    SignedOut,
    AuthTokenPolicyRequired,
    DeviceLoginDenied,
    DeviceLoginCodeExpired,
    DeviceAuthorizationPending,
    AuthInteractionAbandoned,
    AuthExchangeFailed,
    WorkspaceConfigurationFailed,
    WorkspaceSyncFailed,
  ] as const;

type RecognizedFailure = InstanceType<ReturnType<typeof workspaceFailureClasses>[number]>;
const _recognizesEveryRenderedFailure = (failure: WorkspaceFailure): RecognizedFailure => failure;
const _rendersEveryRecognizedFailure = (failure: RecognizedFailure): WorkspaceFailure => failure;
void _recognizesEveryRenderedFailure;
void _rendersEveryRecognizedFailure;

/** Whether an untyped failure is one the workspace kernel renders. */
export const isWorkspaceFailure = (error: unknown): error is WorkspaceFailure =>
  workspaceFailureClasses().some((failureClass) => error instanceof failureClass);
