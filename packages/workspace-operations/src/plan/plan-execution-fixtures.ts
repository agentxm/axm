/**
 * Plan-execution fixtures for tests and executable specifications.
 *
 * Production commands convert their parsed intent into a `PlanExecution` at
 * the CLI boundary; these constants let kernel and handler tests drive
 * `previewOrApplyPlan` with an already-decoded approval decision. Production
 * source never imports this module.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { PlanPolicyId } from "./plan.js";
import {
  applyPlanExecution,
  type ConfirmationRecovery,
  type PlanExecution,
} from "./plan-execution.js";

const emptyRecovery: ConfirmationRecovery = { command: [], arguments: [] };

/** An apply whose preapprovable confirmations are already approved. */
export const preapprovedPlanExecution: PlanExecution = applyPlanExecution({
  approval: "preapproved",
  recovery: emptyRecovery,
});

/** An apply from a route that offers preapproval but received none. */
export const promptablePlanExecution = (
  recovery: ConfirmationRecovery,
  acceptedPolicies?: ReadonlySet<PlanPolicyId>,
): PlanExecution =>
  applyPlanExecution({
    approval: "prompt-if-interactive",
    ...(acceptedPolicies === undefined ? {} : { acceptedPolicies }),
    recovery,
  });

/** An apply from a route with no preapprovable confirmation. */
export const interactiveOnlyPlanExecution = (
  recovery: ConfirmationRecovery,
  acceptedPolicies?: ReadonlySet<PlanPolicyId>,
): PlanExecution =>
  applyPlanExecution({
    approval: "interactive-only",
    ...(acceptedPolicies === undefined ? {} : { acceptedPolicies }),
    recovery,
  });
