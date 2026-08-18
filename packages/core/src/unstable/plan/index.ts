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
  ConfiguredAgentOutcomeSchema,
  ArtifactChangeSchema,
  ArtifactMechanismSchema,
  OperationPreconditionSchema,
  PlanExecutionReasonSchema,
  PlanPolicyIdSchema,
  PlanPolicyIds,
  PlanRiskConditionSchema,
} from "./plan.js";
export type {
  ArtifactChange,
  ArtifactMechanism,
  CancelledPlan,
  CompletedJobStep,
  ConfiguredAgentOutcome,
  ErrorJobStep,
  ExecutedJob,
  ExecutedPlan,
  FailedPlan,
  Job,
  JobStepArtifact,
  JobStepArtifactTarget,
  JobStepResult,
  Operation,
  OperationPrecondition,
  Plan,
  PlanExecutionReason,
  PlanPolicyId,
  PlanResolution,
  PlanRiskCondition,
  PlanSection,
  PlannedJobStep,
  PreviewedPlan,
  ReadyJobStep,
  WarnJobStep,
} from "./plan.js";

// Apply plan + operation handler registry
export { applyPlan, type OperationHandler } from "./apply-plan.js";

// Workspace-interactive preview/apply backbone used by install/uninstall/pack.
export { previewOrApplyPlan } from "./resolve-plan.js";
export {
  isExecutionCandidateFresh,
  makeExecutionCandidate,
  type ExecutionCandidate,
} from "./execution-candidate.js";
