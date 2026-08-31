import * as Effect from "effect/Effect";
import type {
  ConfirmationRecovery,
  ConfiguredAgentOperation,
} from "@agentxm/extension-management/unstable/plan";
import {
  previewOrApplyPlan,
  type Plan,
  type PlanPolicyId,
} from "@agentxm/extension-management/unstable/plan";
import { makePlanExecution } from "./confirmation-recovery.js";

export interface LocalPlanFlags {
  readonly preview: boolean;
  readonly yes?: boolean;
  readonly recovery?: ConfirmationRecovery;
  readonly acceptedPolicies?: ReadonlyArray<PlanPolicyId>;
  readonly configuredAgentOperations?: ReadonlyArray<ConfiguredAgentOperation>;
}

export const previewOrApplyLocalPlan = Effect.fn("previewOrApplyLocalPlan")(function* (
  plan: Plan,
  flags: LocalPlanFlags,
) {
  const execution = yield* makePlanExecution(
    { preview: flags.preview, yes: flags.yes ?? false },
    flags.recovery ?? { command: [], arguments: [] },
    flags.acceptedPolicies ?? [],
    flags.configuredAgentOperations,
  );
  return yield* previewOrApplyPlan(plan, { execution });
});
