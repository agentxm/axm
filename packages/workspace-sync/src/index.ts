/**
 * Workspace-sync feature: desired-state reconciliation planning, projection
 * realization, and destructive reconciliation of AXM-managed artifacts on
 * agent surfaces with the desired workspace state.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

export { WorkspaceSyncFailed, type WorkspaceSyncCleanupFailure } from "./errors.js";
export { type SyncFailureAdapter, type SyncPolicyFailure } from "./failure-adapter.js";
export {
  inspectWorkspaceOwnership,
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
  type ConfiguredPackRecovery,
  type ResolvedDesiredRef,
  type RunMcpServerInstall,
  type SyncSelection,
} from "./materialize.js";
