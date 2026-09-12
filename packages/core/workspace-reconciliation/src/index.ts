/** Shared reconciliation policy beneath workspace feature commands. */
// Closure recipes
export {
  buildAuthoredExtensionStep,
  buildInstallOperation,
  buildMaterializeOperation,
  buildNewExtensionStep,
  buildUninstallOperation,
  extensionRefLifecycleWarnings,
  extensionRefRegistryLifecycle,
  formatPackageUrlParts,
  targetFromRef,
  toLabel,
  toLabelWithCompanions,
  toStepKey,
  type AuthoredExtensionOperationArgs,
  type CallerStepFailure,
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

export { WorkspaceSyncFailed, type WorkspaceSyncCleanupFailure } from "./errors.js";
export {
  SyncStepFailureConversion,
  type SyncFailureAdapter,
  type SyncPolicyFailure,
} from "./failure-adapter.js";
export { collectConfiguredPackRecovery } from "./configured-pack-recovery.js";

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
  isInlineMcpServerEntry,
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
  normalizedIdentity,
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

export { collectUnreachableRetirement } from "./retirement.js";

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

export { makeReconciliationLayer } from "./layer.js";

export {
  collectSecretInputNames,
  deleteMcpSecrets,
  installMcpServer,
  readMcpServerManifest,
  type InstallMcpServerOperation,
  type InstallMcpServerOperationArgs,
  type McpSecretDeletionOutcome,
  type McpServerInstallRequirements,
} from "./mcps/install-operation.js";
export { materializeAuthoredMcpServer } from "./mcps/authored-materialization.js";
