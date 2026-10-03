/**
 * @agentxm/workspace-kernel/operations public API.
 *
 * The operations contract every workspace operation speaks: the plan and its
 * steps, operation resolutions, lifecycle events and journals, interruption
 * handling, the serialized failure vocabulary, plan-execution recovery
 * values, the evidence an operation carries, and the interaction ports the
 * CLI implements. Plan execution mechanics live in
 * `@agentxm/workspace-kernel/planning`.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// Plan types
export { operationNativeLocations, settledUnitNativeLocations } from "./native-locations.js";
export {
  BlockingClassSchema,
  defaultOperationPresentation,
  operationPresentation,
  presentationOf,
  ArtifactMechanismSchema,
  PackMembershipDeltaSchema,
  ConfirmableConsentSchema,
  OperationPreconditionSchema,
  PlanPolicyIdSchema,
  PlanPolicyIds,
  PlanRiskConditionSchema,
} from "./plan.js";
export type {
  ArtifactMechanism,
  BlockingClass,
  CompletedJobStep,
  ConfirmableConsent,
  ErrorJobStep,
  ExecutedJob,
  ExecutedPlan,
  Job,
  JobStepArtifact,
  PackMembershipDelta,
  JobStepArtifactSource,
  JobStepArtifactTarget,
  JobStepArtifactReference,
  JobStepResult,
  Operation,
  OperationPrecondition,
  OperationPresentation,
  Plan,
  PlanExecutionCapabilities,
  PlanPolicyId,
  PlanRiskCondition,
  PlannedJobStep,
  ReadyJobStep,
  RegistryLifecycleEvidence,
  SourceSwitchEndpoint,
  SourceSwitchEvidence,
  SourceSwitchFamily,
  PackMemberSourceSwitchDisposition,
  PackMemberSourceSwitchEndpoint,
  PackMemberSourceSwitchEvidence,
  UnitBlocking,
  WarnJobStep,
} from "./plan.js";

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

// Operation lifecycle events — the live contract every observer subscribes to.
export {
  CurrentOperationUnit,
  OperationEventSchema,
  OperationLifecycle,
  OperationModeSchema,
  ProgressAttemptSchema,
  ProgressUnitSchema,
  SettledOutcomeSchema,
  awaitDrained,
  lifecycleEvents,
  makeOperationLifecycle,
  makeThrottledUnitProgress,
  observeChildUnit,
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
  type ProgressAttempt,
  type ProgressUnit,
  type SettledOutcome,
  type UnitFailure,
} from "./operation-events.js";

// Serialized error vocabulary and the plan-family tagged errors.
export {
  ApprovalRecoveryMissing,
  CandidateFingerprintFailed,
  FailureActionSchema,
  FailureMetadataSchema,
  FailureProblemSchema,
  FailureSuggestedActionSchema,
  OPERATION_ERROR_CATEGORIES,
  OperationErrorCategorySchema,
  PlanInteractionFailed,
  STALE_CANDIDATE_DETAIL,
  StaleExecutionCandidate,
  StepFailure,
  defaultFailureDetail,
  makeStepFailure,
  stepFailureRetryCanHelp,
  stepFailureWithCause,
  type FailureAction,
  type FailureInput,
  type FailureMetadata,
  type FailureProblem,
  type FailureSuggestedAction,
  type OperationErrorCategory,
} from "./errors.js";

// Interaction port for preview/apply presentation, progress, and confirmation.
// The CLI runtime provides the Live implementation.
export {
  ResolvePlanInteraction,
  type ApplyConfirmation,
  type ResolvePlanInteractionService,
} from "./resolve-plan-interaction.js";
export {
  InterruptionSignalSource,
  type InterruptionSignalSourceService,
} from "./interruption-signal.js";
export {
  resolveInterruption,
  type InterruptedInvocation,
  type ObservedFootprintEntry,
} from "./interruption-resolution.js";

export {
  applyPlanExecution,
  confirmableRiskApproval,
  confirmationRecoverySuggestions,
  namedPolicyRecoverySuggestions,
  credentialFreeLocatorRecoveryValue,
  previewPlanExecution,
  protectedRecoveryValue,
  publicRecoveryValue,
  recoveryOption,
  recoveryPositional,
  recoverySwitch,
  renderConfirmationRecoveryCommand,
  requestedPlanExecution,
  unclassifiedRecoveryValue,
  type ConfirmableRiskApproval,
  type ConfirmationRecovery,
  type ConfirmationRecoveryArgument,
  type ConfirmationRecoveryValue,
  type ConfiguredAgentOperation,
  type PlanExecution,
  type PlanExecutionRequest,
  type RecoveryApproval,
  type RequestedApproval,
  type RequestedPlanIntent,
} from "./plan-execution.js";

// Job step messaging
export * from "./job-step-message.js";

export { LifecyclePostconditionViolated, ScaffoldedExtensionUnresolved } from "./postconditions.js";

// Artifact change and per-agent outcome vocabulary a step reports against.
export { ArtifactChangeSchema, type ArtifactChange } from "./artifact-change.js";
export {
  ConfiguredAgentOutcomeSchema,
  type ConfiguredAgentOutcome,
} from "./configured-agent-outcome.js";

// Evidence carried from resolution into the plan and its resolution.
export type {
  RegistryBindingProposal,
  ReleaseAgeBypassRecord,
  ReleaseAgeHoldbackRecord,
  ReleaseAgeOperationEvidence,
  ReleaseAgeRecord,
  ReleaseAgeRecordBase,
  SourceBindingProposal,
} from "./evidence.js";

// The refusal an extension lifecycle operation settles with.
export { ExtensionLifecycleFailed, installRefused } from "./refusal.js";

// Install selection interaction port.
export {
  InstallSelectionCancelled,
  InstallSelectionInteraction,
  InstallSelectionUnavailable,
  type InstallSelectionCandidate,
} from "./install-selection.js";

export {
  HookTestResultSchema,
  HookFixtureResultSchema,
  HookEvidenceStatusSchema,
  type HookTestResult,
  type HookEvidenceStatus,
} from "./hook-evidence.js";
