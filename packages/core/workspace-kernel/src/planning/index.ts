/**
 * @agentxm/workspace-kernel/planning public API.
 *
 * Plan execution mechanics: the two-phase candidate orchestration
 * (`prepareExecutionCandidate` then `resolveExecutionCandidate`), plan
 * application, and plan readiness and reconciliation gating. The plan,
 * operation, and failure vocabulary they execute lives in
 * `@agentxm/workspace-kernel/operations`; transactions and the transition lock in
 * `@agentxm/workspace-kernel/settlement`; the composed workspace layer in
 * `@agentxm/workspace-kernel/workspace-state/live`.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// Apply plan + operation handler registry
export { applyPlan, type ApplyPlanOptions, type OperationHandler } from "./plan/apply-plan.js";

// Candidate preparation and interactive preview/apply resolution over the
// workspace read model: preview, confirmation and apply share one candidate,
// so what a person reads and what is applied are the same decision.
export {
  prepareExecutionCandidate,
  resolveExecutionCandidate,
  type PrepareExecutionCandidateOptions,
  type ResolveExecutionCandidateOptions,
} from "./plan/resolve-plan.js";

// Conversion of the plan-execution failure family into the serialized step
// vocabulary.
export {
  planExecutionFailureToStepFailure,
  type PlanExecutionFailure,
} from "./plan/step-failure-conversions.js";

export {
  isExecutionCandidateFresh,
  makeExecutionCandidate,
  type ExecutionCandidate,
} from "./plan/execution-candidate.js";

// Plan readiness and reconciliation gating
export { scanPlanReadiness, type PlanReadinessReport } from "./operations/scan-plan-readiness.js";
export {
  augmentPlanWithReconciliation,
  type AugmentedPlanResult,
  type DegradedLockfileState,
} from "./operations/augment-plan.js";

// Rendering of the source, registry, and dependency-resolution families
export {
  resolutionFailureToStepFailure,
  type ResolutionFamilyFailure,
} from "./resolution-step-failure.js";
