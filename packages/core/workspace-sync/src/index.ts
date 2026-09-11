/**
 * Workspace-sync feature: desired-state reconciliation planning, projection
 * realization, and destructive reconciliation of AXM-managed artifacts on
 * agent surfaces with the desired workspace state.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

export { WorkspaceSyncFailed, type WorkspaceSyncCleanupFailure } from "./errors.js";
export {
  SyncStepFailureConversion,
  type SyncFailureAdapter,
  type SyncPolicyFailure,
} from "./failure-adapter.js";
export { collectConfiguredPackRecovery } from "./configured-pack-recovery.js";
export {
  planWorkspaceMaterialization,
  prepareSyncWorkspace,
  previewOrApplySyncWorkspace,
  SyncWorkspace,
  type SyncWorkspaceCandidate,
  type SyncWorkspaceExecutionFailure,
  type SyncWorkspaceFailure,
  type SyncWorkspaceRequest,
  type SyncWorkspaceRequirements,
  type WorkspaceAlreadyReconciled,
} from "./sync-workspace.js";
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
  type CollectedMaterializeSteps,
  type ConfiguredEntryResolutionRequirements,
  type ConfiguredPackRecovery,
  type SyncSelection,
} from "./materialize.js";
