/** Shared reconciliation policy beneath workspace feature commands. */
// Closure recipes
export {
  buildAuthoredExtensionStep,
  buildInstallOperation,
  buildMaterializeOperation,
  buildNewExtensionStep,
  buildUninstallOperation,
  classifyInstallChange,
  forecastInstallChange,
  extensionRefRegistryLifecycle,
  formatPackageUrlParts,
  targetFromRef,
  nameFromLabel,
  toLabel,
  toLabelWithCompanions,
  toTypedLabel,
  toStepKey,
  extensionFromStepKey,
  type AuthoredExtensionOperationArgs,
  type CallerStepFailure,
  type InstallArtifactPresentation,
  type InstallChange,
  type InstallOperationArgs,
  type MaterializeOperationArgs,
  type NewExtensionOperationArgs,
  type RecipeRequirements,
  type StepFailureAdapter,
  type UninstallOperationArgs,
  type UninstallRetentionPolicy,
  type UninstallSettlement,
  type UnreadablePackageRetirement,
} from "./extensions/operations.js";
export {
  configuredEntryResolutionRefused,
  INSTALL_HELD_RELEASE_POLICY,
  sourceResolutionFailureDetail,
  sourceResolutionRefused,
  type ConfiguredInstallFailure,
  type InstallStepRequirements,
  type PackRecoveryDependencyResolver,
  type ResolvedInstallRef,
  type ResolveInstallRequirements,
} from "./install-vocabulary.js";
export { buildAggregateProjectionStep } from "./aggregate-projection-step.js";
export { buildPackMemberStep, type PackMemberRef } from "./extensions/pack-member-step.js";
export {
  registrySourceArtifact,
  registrySourcePath,
} from "./extensions/registry-source-artifact.js";

export {
  WorkspaceSyncFailed,
  type SyncPolicyFailure,
  type WorkspaceSyncCleanupFailure,
} from "./errors.js";
export {
  StepFailureConversion,
  withAdaptedStepFailures,
  type StepFailureConversionService,
} from "./step-failure-conversion.js";

export {
  reconcileAgentOutputs,
  type ReconcileAgentOutputsArgs,
  type ReconcileAgentOutputsResult,
} from "./rendered-file-cleanup.js";
export {
  buildInlineMcpServerSyncOperation,
  buildMcpServerPruneOperation,
  collectCleanupStep,
  collectHooksStep,
  collectInstructionStep,
  collectKnowledgeStep,
  makeSyncPlan,
  projectionDivergenceLabel,
  projectionFactsNeedReconciliation,
  SYNC_PLAN_DESCRIPTION,
  SYNC_PLAN_NAME,
  SYNC_PRESENTATION,
  SYNC_RECOVERY_IDS,
  syncRecoveryIdentifiers,
  type SyncStepRequirements,
} from "./plan.js";
export {
  collectMaterializeSteps,
  recoverableExternalPackName,
  scopedProblems,
  selectedDesiredNodes,
  type CollectedMaterializeSteps,
  type ConfiguredEntryResolutionRequirements,
  type ConfiguredPackRecovery,
  type SyncSelection,
} from "./materialize.js";

export {
  proposeDesiredState,
  publishDesiredState,
  type DesiredStateChange,
  type DesiredStateProposal,
} from "./proposed-state.js";
export {
  prepareActivationRealization,
  realizeActivation,
  type ActivationRealization,
  type ActivationRealized,
} from "./activation.js";

export { collectLeftoverRetirement, collectUnreachableRetirement } from "./retirement.js";

export { prepareUninstallArtifact } from "./uninstall-artifact.js";

export {
  buildReconciliationClosure,
  type ReconciliationChild,
  type ReconciliationClosureArgs,
} from "./closure.js";

export {
  makeWorkspaceRetentionPolicy,
  exclusiveMemberRetentionPolicy,
} from "./retention-policy.js";

export {
  isKernelFailure,
  kernelFailureDetail,
  kernelFailureToStepFailure,
  renderKernelFailure,
  type KernelFailure,
  type KernelFailureRendering,
} from "./failure-rendering.js";

export {
  captureRequiredNativeOutputs,
  validateNativeOutputPostconditions,
} from "./native-output-postconditions.js";
