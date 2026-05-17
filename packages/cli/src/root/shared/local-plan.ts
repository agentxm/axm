import * as Effect from "effect/Effect";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { applyPlan, type Plan, type PlanResolution } from "@agentxm/client-core/unstable/plan";
import { displayPlan } from "@agentxm/client-core/unstable/workspace";

export interface LocalPlanFlags {
  readonly preview: boolean;
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
  const renderer = yield* CliRenderer;

  if (flags.preview) {
    yield* renderer.info("Previewing changes...");
    yield* displayPlan(plan);
    return previewPlan(plan);
  }

  return yield* applyPlan(plan).pipe(Effect.tap(displayPlan));
});
