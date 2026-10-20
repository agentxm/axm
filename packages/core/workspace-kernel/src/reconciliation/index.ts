/** Shared reconciliation policy beneath workspace feature commands. */
// Closure recipes
export {
  buildAuthoredExtensionStep,
  buildInstallOperation,
  buildNewExtensionStep,
  buildUninstallOperation,
  classifyInstallChange,
  forecastInstallChange,
  extensionRefRegistryLifecycle,
  targetFromRef,
  nameFromLabel,
  toLabel,
  toTypedLabel,
  toStepKey,
  extensionFromStepKey,
  type AuthoredExtensionOperationArgs,
  type InstallArtifactPresentation,
  type InstallChange,
  type NewExtensionOperationArgs,
  type RecipeRequirements,
  type UninstallRetentionPolicy,
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

export { syncRefused, type SyncPolicyFailure } from "./errors.js";
export {
  StepFailureConversion,
  withAdaptedStepFailures,
  type StepFailureConversionService,
} from "./step-failure-conversion.js";

export { reconcileAgentOutputs } from "./rendered-file-cleanup.js";
export {
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

export { proposeDesiredState, type DesiredStateProposal } from "./proposed-state.js";
export {
  prepareEnabledRealization,
  prepareDisabledRealization,
  realizeActivation,
  type ActivationRealization,
} from "./activation.js";

export { collectUnreachableRetirement } from "./retirement.js";

export { prepareUninstallArtifact } from "./uninstall-artifact.js";

export {
  buildReconciliationClosure,
  groupRetainedPackageSteps,
  type ReconciliationChild,
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
} from "./failure-rendering.js";

export {
  captureRequiredNativeOutputs,
  captureNativeOutputRetention,
  validateNativeOutputPostconditions,
} from "./native-output-postconditions.js";
