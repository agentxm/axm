/**
 * Plan pipeline — the stable kernel export path for the plan primitives
 * consumed by workspace commands and other shared-kernel
 * consumer that composes workspace `Operation`s.
 *
 * The registry Worker SHALL NOT import this module — publish never applies
 * fixes, so the plan pipeline tree-shakes out of the Worker bundle. See
 * the shared-kernel contract for plan pipeline primitives.
 *
 * Per-extension operation handlers live in their domain modules and resolve
 * their `OperationHandler` type from this path.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// Plan types
export {
  BlockingClassSchema,
  ConfiguredAgentOutcomeSchema,
  defaultOperationPresentation,
  operationPresentation,
  presentationOf,
  ArtifactChangeSchema,
  ArtifactMechanismSchema,
  OperationPreconditionSchema,
  PlanPolicyIdSchema,
  PlanPolicyIds,
  PlanRiskConditionSchema,
} from "./plan.js";
export type {
  ArtifactChange,
  ArtifactMechanism,
  BlockingClass,
  CompletedJobStep,
  ConfiguredAgentOutcome,
  ErrorJobStep,
  ExecutedJob,
  ExecutedPlan,
  Job,
  JobStepArtifact,
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
  UnitBlocking,
  WarnJobStep,
} from "./plan.js";

// Operation resolution — the single value every plan-family command
// terminates with, with its pure outcome/exit derivations.
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
  operationExitCode,
  operationOk,
  plannedUnits,
  unitIdOf,
  unitsByStableIdentity,
} from "./operation-resolution.js";
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
} from "./operation-resolution.js";

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
} from "./operation-journal.js";

// Apply plan + operation handler registry
export { applyPlan, type ApplyPlanOptions, type OperationHandler } from "./apply-plan.js";
export {
  OperationLifecycle,
  makeOperationLifecycle,
  publishLifecycleEvent,
  publishPhaseStarted,
  subscribeToLifecycle,
  type OperationLifecycleEvent,
  type OperationLifecycleService,
} from "./operation-events.js";

// Workspace-interactive preview/apply backbone used by install/uninstall/pack.
export { STALE_CANDIDATE_DETAIL, previewOrApplyPlan } from "./resolve-plan.js";
// Interaction port for preview/apply presentation, progress, and confirmation.
// The CLI runtime provides the Live implementation.
export {
  ResolvePlanInteraction,
  ResolvePlanInteractionTest,
  type ApplyConfirmation,
  type ResolvePlanInteractionService,
  type ResolvePlanInteractionTestState,
} from "./resolve-plan-interaction.js";
export {
  InterruptionSignalSource,
  type InterruptionSignalSourceService,
} from "./interruption-signal.js";
export {
  isExecutionCandidateFresh,
  makeExecutionCandidate,
  type ExecutionCandidate,
} from "./execution-candidate.js";
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
} from "./plan-execution.js";
