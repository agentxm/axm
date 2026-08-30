import type * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions";
import { HookManager } from "@agentxm/extension-management/unstable/hooks";
import { KnowledgeManager } from "@agentxm/extension-management/unstable/knowledge";
import type { JobStepResult, PlannedJobStep } from "@agentxm/extension-management/unstable/plan";
import {
  applyProjectionPlans,
  type ProjectionPlan,
} from "@agentxm/extension-management/unstable/projection";
import { RuleManager } from "@agentxm/extension-management/unstable/rules";

/**
 * One trailing projection write per semantic closure. Member steps commit
 * canonical, settings, and lock state without touching shared aggregate units;
 * this step then renders each affected unit exactly once from the complete
 * desired-state contributor set.
 */
export const buildAggregateProjectionStep = (args: {
  readonly types: ReadonlySet<ExtensionType>;
}): Effect.Effect<
  Option.Option<PlannedJobStep>,
  never,
  HookManager | KnowledgeManager | RuleManager
> =>
  Effect.gen(function* () {
    if (!args.types.has("rule") && !args.types.has("hook") && !args.types.has("knowledge")) {
      return Option.none<PlannedJobStep>();
    }
    const ruleManager = args.types.has("rule")
      ? Option.some(yield* RuleManager)
      : Option.none<ServiceMap.Service.Shape<typeof RuleManager>>();
    const hookManager = args.types.has("hook")
      ? Option.some(yield* HookManager)
      : Option.none<ServiceMap.Service.Shape<typeof HookManager>>();
    const knowledgeManager = args.types.has("knowledge")
      ? Option.some(yield* KnowledgeManager)
      : Option.none<ServiceMap.Service.Shape<typeof KnowledgeManager>>();
    return Option.some<PlannedJobStep>({
      key: "projection:aggregate-units",
      label: "shared projections",
      readiness: "ready",
      run: Effect.gen(function* () {
        const plans: Array<ProjectionPlan> = [];
        if (Option.isSome(ruleManager)) {
          plans.push(...(yield* ruleManager.value.projectionPlans()));
        }
        if (Option.isSome(hookManager)) {
          plans.push(...(yield* hookManager.value.projectionPlans()));
        }
        if (Option.isSome(knowledgeManager)) {
          plans.push(...(yield* knowledgeManager.value.projectionPlans()));
        }
        yield* applyProjectionPlans(plans);
      }).pipe(
        Effect.as({
          result: "success",
          message: "Rendered shared aggregate units from the complete contributor set",
        } satisfies JobStepResult),
      ),
    });
  });
