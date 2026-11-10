/**
 * Plan-execution fixtures for tests and executable specifications.
 *
 * Production commands convert their parsed intent into a `PlanExecution` at
 * the CLI boundary; these constants let kernel and handler tests resolve
 * an execution candidate with an already-decoded approval decision. Production
 * source never imports this module.
 *
 * @experimental This API is unstable and may change without notice.
 */

import {
  type PlanPolicyId,
  applyPlanExecution,
  type CommandInvocation,
  type PlanExecution,
} from "../../operations/index.js";

const emptyRecovery: CommandInvocation = { command: [], arguments: [] };

/** An apply whose preapprovable confirmations are already approved. */
export const preapprovedPlanExecution: PlanExecution = applyPlanExecution({
  approval: "preapproved",
  recovery: emptyRecovery,
});

/** An apply from a route that offers preapproval but received none. */
export const promptablePlanExecution = (
  recovery: CommandInvocation,
  acceptedPolicies?: ReadonlySet<PlanPolicyId>,
): PlanExecution =>
  applyPlanExecution({
    approval: "prompt-if-interactive",
    ...(acceptedPolicies === undefined ? {} : { acceptedPolicies }),
    recovery,
  });

/** An apply from a route with no preapprovable confirmation. */
export const interactiveOnlyPlanExecution = (
  recovery: CommandInvocation,
  acceptedPolicies?: ReadonlySet<PlanPolicyId>,
): PlanExecution =>
  applyPlanExecution({
    approval: "interactive-only",
    ...(acceptedPolicies === undefined ? {} : { acceptedPolicies }),
    recovery,
  });
