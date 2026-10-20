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
export { applyPlan, type OperationHandler } from "./plan/apply-plan.js";

// Candidate preparation and interactive preview/apply resolution over the
// workspace read model: preview, confirmation and apply share one candidate,
// so what a person reads and what is applied are the same decision.
export {
  prepareExecutionCandidate,
  resolveExecutionCandidate,
  type PlanResolutionFailure,
} from "./plan/resolve-plan.js";

// The plan-execution failure family.
export { planExecutionFailures } from "./plan/step-failure-conversions.js";

export {
  isExecutionCandidateFresh,
  makeExecutionCandidate,
  type ExecutionCandidate,
} from "./plan/execution-candidate.js";

// Plan readiness and reconciliation gating
// Rendering of the source, registry, and dependency-resolution families
export {
  registrySelectionFailedStepFailure,
  registrySourceUnknownStepFailure,
  resolutionFailures,
  resolutionFailureToStepFailure,
} from "./resolution-step-failure.js";
