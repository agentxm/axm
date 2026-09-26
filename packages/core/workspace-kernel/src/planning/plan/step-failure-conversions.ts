/**
 * The rendering of the plan-execution failure family into the one rendered
 * failure a plan step settles with and the application boundary projects.
 * The state and settlement families render beside the workspace state.
 *
 * @experimental This API is unstable and may change without notice.
 */

import {
  STALE_CANDIDATE_DETAIL,
  makeStepFailure,
  type ApprovalRecoveryMissing,
  type CandidateFingerprintFailed,
  type LifecyclePostconditionViolated,
  type PlanInteractionFailed,
  type ScaffoldedExtensionUnresolved,
  type StaleExecutionCandidate,
  type StepFailure,
} from "../../operations/index.js";
import { candidateFingerprintFailedToStepFailure } from "../../workspace-state/index.js";

/** Every plan-execution failure the kernel constructs. */
export type PlanExecutionFailure =
  | StaleExecutionCandidate
  | CandidateFingerprintFailed
  | ApprovalRecoveryMissing
  | PlanInteractionFailed
  | LifecyclePostconditionViolated
  | ScaffoldedExtensionUnresolved;

const postconditionDetail = (failure: LifecyclePostconditionViolated): string => {
  switch (failure.postcondition) {
    case "install-observable":
      return `Installed ${failure.targetType} "${failure.targetName}" did not satisfy its observable contract`;
    case "install-declared":
      return `Installed ${failure.targetType} "${failure.targetName}" has no desired-state declaration`;
    case "new-observable":
      return `New ${failure.targetType} "${failure.targetName}" did not satisfy its observable contract`;
    case "new-declared":
      return `New ${failure.targetType} "${failure.targetName}" has no desired-state declaration`;
    case "materialize-observable":
      return `Reconciled ${failure.targetType} "${failure.targetName}" did not satisfy its observable contract`;
    case "uninstall-remains-declared":
      return `Uninstalled ${failure.targetType} "${failure.targetName}" remains declared`;
    case "uninstall-observed-state":
      return `Uninstalled ${failure.targetType} "${failure.targetName}" has an invalid observed postcondition`;
  }
};

/** Translate one plan-execution failure. */
export const planExecutionFailureToStepFailure = (failure: PlanExecutionFailure): StepFailure => {
  switch (failure._tag) {
    case "StaleExecutionCandidate":
      return makeStepFailure({ category: "conflict", detail: STALE_CANDIDATE_DETAIL });
    case "CandidateFingerprintFailed":
      return candidateFingerprintFailedToStepFailure(failure);
    case "ApprovalRecoveryMissing":
      return makeStepFailure({
        category: "internal",
        detail: "Apply execution is missing approval recovery metadata",
      });
    case "PlanInteractionFailed":
      return makeStepFailure({
        category: failure.category,
        detail: failure.detail,
        suggestions: failure.suggestions,
        cause: failure.cause,
      });
    case "LifecyclePostconditionViolated":
      return makeStepFailure({ category: "internal", detail: postconditionDetail(failure) });
    case "ScaffoldedExtensionUnresolved":
      return makeStepFailure({
        category: "not_found",
        detail: `Newly scaffolded ${failure.targetType} "${failure.targetName}" could not be resolved from its workspace source`,
      });
  }
};
