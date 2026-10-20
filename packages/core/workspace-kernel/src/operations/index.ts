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
  OperationPreconditionSchema,
  PlanPolicyIds,
  PlanRiskConditionSchema,
} from "./plan.js";
export type {
  BlockingClass,
  CompletedJobStep,
  ExecutedPlan,
  Job,
  JobStepArtifact,
  PackMembershipDelta,
  JobStepArtifactTarget,
  JobStepLastWrite,
  JobStepManagedRegion,
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
  SourceSwitchEndpoint,
  SourceSwitchEvidence,
  SourceSwitchFamily,
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
  OperationBlock,
  OperationFootprintEntry,
  OperationOutcome,
  OperationPhase,
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
  type OperationJournalState,
} from "./operation-journal.js";

// Operation lifecycle events — the live contract every observer subscribes to.
export {
  CurrentOperationUnit,
  OperationEventSchema,
  OperationLifecycle,
  OperationModeSchema,
  SettledOutcomeSchema,
  awaitDrained,
  lifecycleEvents,
  makeOperationLifecycle,
  makeThrottledUnitProgress,
  observeChildUnit,
  observeUnit,
  publishOperationEvent,
  publishPhaseStarted,
  publishWaitEnded,
  publishWaiting,
  settleOperation,
  subscribeLossless,
  type OperationEvent,
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
  FailureMetadataSchema,
  FailureProblemSchema,
  FailureSuggestedActionSchema,
  OPERATION_ERROR_CATEGORIES,
  ErrorCodeSchema,
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
  type ErrorCode,
} from "./errors.js";

// Interaction port for preview/apply presentation, progress, and confirmation.
// The CLI runtime provides the Live implementation.
export {
  ResolvePlanInteraction,
  type ApplyConfirmation,
  type ResolvePlanInteractionService,
} from "./resolve-plan-interaction.js";
export { InterruptionSignalSource } from "./interruption-signal.js";
export { resolveInterruption } from "./interruption-resolution.js";

export {
  applyPlanExecution,
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
  type ConfirmationRecovery,
  type ConfirmationRecoveryArgument,
  type ConfiguredAgentOperation,
  type PlanExecution,
  type RequestedPlanIntent,
} from "./plan-execution.js";

// Job step messaging
export * from "./job-step-message.js";

export { LifecyclePostconditionViolated, ScaffoldedExtensionUnresolved } from "./postconditions.js";

// Artifact change and per-agent outcome vocabulary a step reports against.
export { ArtifactChangeSchema, type ArtifactChange } from "./artifact-change.js";
export {
  ConfiguredAgentOutcomeSchema,
  ConfiguredAgentReasonCodeSchema,
  type ConfiguredAgentReasonCode,
  type ConfiguredAgentOutcome,
} from "./configured-agent-outcome.js";

// Evidence carried from resolution into the plan and its resolution.
export type {
  RegistryBindingProposal,
  ReleaseAgeBypassRecord,
  ReleaseAgeHoldbackRecord,
  ReleaseAgeOperationEvidence,
  ReleaseAgeRecord,
  // Dependents' inferred install-graph types name this base, so their
  // declaration emit must be able to; knip skips exports tagged public.
  /** @public */
  ReleaseAgeRecordBase,
  SourceBindingProposal,
} from "./evidence.js";

// The refusal a workspace operation settles with, and the lifecycle family's helper.
export { OperationRefused, installRefused, operationRefusals, refusalOf } from "./refusal.js";

// Failure families: recognition and rendering, each defined once by its owner.
export {
  defineFailureFamily,
  renderCarriedFailure,
  type FailureFamily,
  type FailureOf,
  type FailureRendering,
} from "./failure-family.js";

// Install selection interaction port.
export {
  InstallSelectionCancelled,
  InstallSelectionInteraction,
  InstallSelectionUnavailable,
  type InstallSelectionCandidate,
  type InstallSelectionMember,
} from "./install-selection.js";

export {
  HookTestResultSchema,
  HookFixtureResultSchema,
  HookEvidenceStatusSchema,
  type HookTestResult,
  type HookEvidenceStatus,
} from "./hook-evidence.js";

export {
  FailureDiagnosticSchema,
  FailureOperation,
  diagnosticKindOfTag,
  inFailureOperation,
  type FailureDiagnostic,
} from "./failure-diagnostic.js";
