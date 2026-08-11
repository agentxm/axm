import * as Effect from "effect/Effect";
import type { ConfirmationRecovery } from "@agentxm/client-core/unstable/cli-runtime";
import {
  previewOrApplyPlan,
  type Plan,
  type PlanPolicyId,
} from "@agentxm/client-core/unstable/plan";
import { makePlanExecution } from "./confirmation-recovery.js";

export interface LocalPlanFlags {
  readonly preview: boolean;
  readonly yes?: boolean;
  readonly displayApplied?: boolean;
  readonly recovery?: ConfirmationRecovery;
  readonly acceptedPolicies?: ReadonlyArray<PlanPolicyId>;
}

export const previewOrApplyLocalPlan = Effect.fn("previewOrApplyLocalPlan")(function* (
  plan: Plan,
  flags: LocalPlanFlags,
) {
  const execution = yield* makePlanExecution(
    { preview: flags.preview, yes: flags.yes ?? false },
    flags.recovery ?? { command: [], arguments: [] },
    flags.acceptedPolicies ?? [],
  );
  return yield* previewOrApplyPlan(plan, {
    execution,
    ...(flags.displayApplied === undefined ? {} : { displayApplied: flags.displayApplied }),
  });
});
