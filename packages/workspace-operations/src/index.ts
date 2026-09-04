/**
 * @agentxm/workspace-operations public API.
 *
 * The workspace-operations kernel: plan vocabulary and execution, the
 * interactive preview/apply orchestration (`previewOrApplyPlan`), operation
 * resolutions and journals, plan readiness and reconciliation gating, and the
 * workspace transaction and transition-lock machinery. The composed workspace
 * layer lives behind `./live`.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// Plan types
export {
  BlockingClassSchema,
  defaultOperationPresentation,
  operationPresentation,
  presentationOf,
  ArtifactMechanismSchema,
  OperationPreconditionSchema,
  PlanPolicyIdSchema,
  PlanPolicyIds,
  PlanRiskConditionSchema,
} from "./plan/plan.js";
export type {
  ArtifactMechanism,
  BlockingClass,
  CompletedJobStep,
  ErrorJobStep,
  ExecutedJob,
  ExecutedPlan,
  Job,
  JobStepArtifact,
  JobStepArtifactSource,
  JobStepArtifactTarget,
  JobStepResult,
  Operation,
  OperationPrecondition,
  OperationPresentation,
  Plan,
  PlanPolicyId,
  PlanRiskCondition,
  PlannedJobStep,
  ReadyJobStep,
  RegistryLifecycleEvidence,
  UnitBlocking,
  WarnJobStep,
} from "./plan/plan.js";

// Operation resolution — the single value every plan-family command
// terminates with, with its pure outcome derivations.
export {
  AtomicityClassSchema,
  OperationOutcomeSchema,
  OperationPhaseSchema,
  UnitDispositionSchema,
  UnitStateSchema,
  countUnitStates,
  declaredAtomicity,
  deriveOperationOutcome,
  executedUnits,
  makeOperationResolution,
  plannedUnits,
  unitIdOf,
  unitsByStableIdentity,
} from "./plan/operation-resolution.js";
export type {
  AtomicityClass,
  MakeOperationResolutionArgs,
  OperationAtomicity,
  OperationBlock,
  OperationFootprintEntry,
  OperationInterruption,
  OperationOutcome,
  OperationPhase,
  OperationRecovery,
  OperationResolution,
  ResolvedUnit,
  UnitDisposition,
  UnitState,
  UnitStateCounts,
} from "./plan/operation-resolution.js";

// Operation journal — invocation-scoped progress record for interruption.
export {
  OperationJournal,
  appendResolvedUnit,
  appendStartedUnit,
  recordJournalPhase,
  getOperationJournal,
  makeOperationJournal,
  recordOperationJournal,
  updateOperationJournal,
  type OperationJournalService,
  type OperationJournalState,
} from "./plan/operation-journal.js";

// Apply plan + operation handler registry
export { applyPlan, type ApplyPlanOptions, type OperationHandler } from "./plan/apply-plan.js";
// Operation lifecycle events — the live contract every observer subscribes to.
export {
  CurrentOperationUnit,
  OperationEventSchema,
  OperationLifecycle,
  OperationModeSchema,
  ProgressUnitSchema,
  SettledOutcomeSchema,
  awaitDrained,
  lifecycleEvents,
  makeOperationLifecycle,
  makeThrottledUnitProgress,
  observeUnit,
  publishOperationEvent,
  publishPhaseStarted,
  publishUnitProgress,
  publishWaitEnded,
  publishWaiting,
  settleOperation,
  subscribeLossless,
  type ObservedUnit,
  type OperationEvent,
  type OperationEventEncoded,
  type OperationEventInput,
  type OperationLifecycleService,
  type OperationMode,
  type ProgressUnit,
  type SettledOutcome,
} from "./plan/operation-events.js";

// Serialized error vocabulary and the plan-family tagged errors.
export {
  ApprovalRecoveryMissing,
  CandidateFingerprintFailed,
  OPERATION_ERROR_CATEGORIES,
  OperationErrorCategorySchema,
  PlanInteractionFailed,
  STALE_CANDIDATE_DETAIL,
  StaleExecutionCandidate,
  StepFailure,
  type OperationErrorCategory,
} from "./plan/errors.js";

// Interactive preview/apply orchestration over the workspace read model.
export { previewOrApplyPlan } from "./plan/resolve-plan.js";

// Interaction port for preview/apply presentation, progress, and confirmation.
// The CLI runtime provides the Live implementation.
export {
  ResolvePlanInteraction,
  type ApplyConfirmation,
  type ResolvePlanInteractionService,
} from "./plan/resolve-plan-interaction.js";
export {
  InterruptionSignalSource,
  type InterruptionSignalSourceService,
} from "./plan/interruption-signal.js";
export {
  isExecutionCandidateFresh,
  makeExecutionCandidate,
  type ExecutionCandidate,
} from "./plan/execution-candidate.js";
export {
  applyPlanExecution,
  confirmationRecoverySuggestions,
  namedPolicyRecoverySuggestions,
  credentialFreeLocatorRecoveryValue,
  preapprovedPlanExecution,
  promptablePlanExecution,
  previewPlanExecution,
  protectedRecoveryValue,
  publicRecoveryValue,
  recoveryOption,
  recoveryPositional,
  recoverySwitch,
  renderConfirmationRecoveryCommand,
  unclassifiedRecoveryValue,
  type ConfirmationRecovery,
  type ConfirmationRecoveryArgument,
  type ConfirmationRecoveryValue,
  type ConfiguredAgentOperation,
  type PlanExecution,
  type PlanExecutionRequest,
} from "./plan/plan-execution.js";

// Job step messaging
export * from "./plan/job-step-message.js";

// Plan readiness and reconciliation gating
export { scanPlanReadiness, type PlanReadinessReport } from "./operations/scan-plan-readiness.js";
export {
  augmentPlanWithReconciliation,
  type AugmentedPlanResult,
  type DegradedLockfileState,
} from "./operations/augment-plan.js";

// Workspace transaction runner and closure lifecycle
export {
  rollbackWorkspaceClosure,
  runWorkspaceTransaction,
  settleWorkspaceClosure,
  withWorkspaceClosure,
  type WorkspaceTransactionArgs,
} from "./operations/transaction.js";

// Transition lock runtime
export {
  TRANSITION_WAIT_BOUND_MILLIS,
  acquireWorkspaceTransitionLock,
  heldWorkspaceTransition,
  isWorkspaceTransitionHeldByThisInvocation,
  transitionLockPath,
  type HeldWorkspaceTransition,
} from "./operations/transition-lock.js";
