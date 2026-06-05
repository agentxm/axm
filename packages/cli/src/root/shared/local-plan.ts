import * as Effect from "effect/Effect";
import { applyPlan, type Plan, type PlanResolution } from "@agentxm/client-core/unstable/plan";
import { displayPlan } from "@agentxm/client-core/unstable/workspace";

export interface LocalPlanFlags {
  readonly preview: boolean;
  readonly displayApplied?: boolean;
}

const previewPlan = (plan: Plan): PlanResolution => ({
  _tag: "PreviewedPlan",
  name: plan.name,
  description: plan.description,
  jobs: plan.jobs,
});

export const previewOrApplyLocalPlan = Effect.fn("previewOrApplyLocalPlan")(function* (
  plan: Plan,
  flags: LocalPlanFlags,
) {
  if (flags.preview) {
    yield* displayPlan(plan);
    return previewPlan(plan);
  }

  const resolution = yield* applyPlan(plan);
  if (flags.displayApplied !== false) {
    yield* displayPlan(resolution);
  }
  return resolution;
});
