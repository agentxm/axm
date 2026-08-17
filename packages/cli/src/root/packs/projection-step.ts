import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { AppError } from "@agentxm/client-core/unstable/app-error";
import type { ExtensionType } from "@agentxm/client-core/unstable/extensions";
import { HookManager } from "@agentxm/client-core/unstable/hooks";
import { KnowledgeManager } from "@agentxm/client-core/unstable/knowledge";
import type { JobStepResult, PlannedJobStep } from "@agentxm/client-core/unstable/plan";
import { RuleManager } from "@agentxm/client-core/unstable/rules";

/**
 * One trailing projection write per pack closure. Pack member steps commit
 * canonical, settings, and lock state without touching shared aggregate units;
 * this step then renders each affected unit exactly once from the complete
 * desired-state contributor set.
 */
export const buildPackProjectionStep = (args: {
  readonly types: ReadonlySet<ExtensionType>;
}): Effect.Effect<
  Option.Option<PlannedJobStep>,
  never,
  HookManager | KnowledgeManager | RuleManager
> =>
  Effect.gen(function* () {
    const ruleManager = yield* RuleManager;
    const hookManager = yield* HookManager;
    const knowledgeManager = yield* KnowledgeManager;
    const reconciles: Array<Effect.Effect<void, AppError>> = [];
    if (args.types.has("rule")) reconciles.push(ruleManager.reconcileProjections());
    if (args.types.has("hook")) reconciles.push(hookManager.reconcileProjections());
    if (args.types.has("knowledge") && knowledgeManager.reconcileProjections !== undefined) {
      reconciles.push(knowledgeManager.reconcileProjections());
    }
    if (reconciles.length === 0) return Option.none<PlannedJobStep>();
    return Option.some<PlannedJobStep>({
      key: "projection:aggregate-units",
      label: "shared projections",
      readiness: "ready",
      run: Effect.forEach(reconciles, (reconcile) => reconcile, {
        concurrency: 1,
        discard: true,
      }).pipe(
        Effect.as({
          result: "success",
          message: "Rendered shared aggregate units from the complete contributor set",
        } satisfies JobStepResult),
      ),
    });
  });
