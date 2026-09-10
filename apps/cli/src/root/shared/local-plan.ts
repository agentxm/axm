import * as Effect from "effect/Effect";
import type { ConfirmationRecovery, ConfiguredAgentOperation } from "@agentxm/workspace-operations";
import { previewOrApplyPlan, type Plan, type PlanPolicyId } from "@agentxm/workspace-operations";
import { makePlanExecution, type CommandExecutionIntent } from "./confirmation-recovery.js";

export interface LocalPlanFlags extends CommandExecutionIntent {
  readonly recovery?: ConfirmationRecovery;
  readonly acceptedPolicies?: ReadonlyArray<PlanPolicyId>;
  readonly configuredAgentOperations?: ReadonlyArray<ConfiguredAgentOperation>;
}

export const previewOrApplyLocalPlan = Effect.fn("previewOrApplyLocalPlan")(function* (
  plan: Plan,
  flags: LocalPlanFlags,
) {
  const execution = yield* makePlanExecution(
    { preview: flags.preview, ...(flags.yes === undefined ? {} : { yes: flags.yes }) },
    flags.recovery ?? { command: [], arguments: [] },
    flags.acceptedPolicies ?? [],
    flags.configuredAgentOperations,
  );
  return yield* previewOrApplyPlan(plan, { execution });
});
