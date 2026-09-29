import type * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions";
import type { JobStepResult, PlannedJobStep } from "../operations/index.js";
import {
  HookManager,
  KnowledgeManager,
  RuleManager,
  type ExtensionManagerFailure,
  type ManagerRequirements,
  type NativeProjectionOptions,
} from "../materialization/index.js";
import { applyInstructionSurfacePlans, type ProjectionPlan } from "../projection/index.js";
import { WorkspaceLocation } from "../workspace-state/index.js";
import { combineNativeLocationOutcomes } from "../locations/index.js";
import { kernelFailureToStepFailure } from "./failure-rendering.js";
import type { InstallStepRequirements } from "./install-vocabulary.js";

/**
 * One trailing projection write per semantic closure. Member steps commit
 * canonical, settings, and lock state without touching shared aggregate units;
 * this step then renders each affected unit exactly once from the complete
 * desired-state contributor set.
 */
export const buildAggregateProjectionStep = (args: {
  readonly types: ReadonlySet<ExtensionType>;
  readonly nativeProjections?: Readonly<
    Partial<Record<"rule" | "hook" | "knowledge", NativeProjectionOptions>>
  >;
}): Effect.Effect<
  Option.Option<PlannedJobStep<InstallStepRequirements>>,
  never,
  HookManager | KnowledgeManager | RuleManager
> =>
  Effect.gen(function* () {
    if (!args.types.has("rule") && !args.types.has("hook") && !args.types.has("knowledge")) {
      return Option.none<PlannedJobStep<InstallStepRequirements>>();
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
    return Option.some<PlannedJobStep<InstallStepRequirements>>({
      key: "projection:aggregate-units",
      label: "instruction files",
      readiness: "ready",
      run: Effect.gen(function* () {
        const plans: Array<ProjectionPlan<void, ExtensionManagerFailure, ManagerRequirements>> = [];
        if (Option.isSome(ruleManager)) {
          plans.push(...(yield* ruleManager.value.projectionPlans(args.nativeProjections?.rule)));
        }
        if (Option.isSome(hookManager)) {
          plans.push(...(yield* hookManager.value.projectionPlans(args.nativeProjections?.hook)));
        }
        if (Option.isSome(knowledgeManager)) {
          plans.push(
            ...(yield* knowledgeManager.value.projectionPlans(args.nativeProjections?.knowledge)),
          );
        }
        const warnings = yield* applyInstructionSurfacePlans(plans);
        const location = yield* WorkspaceLocation;
        const observations = [
          ...(Option.isSome(ruleManager)
            ? [yield* ruleManager.value.aggregateProjectionObservation]
            : []),
          ...(Option.isSome(hookManager)
            ? [yield* hookManager.value.aggregateProjectionObservation]
            : []),
          ...(Option.isSome(knowledgeManager)
            ? [yield* knowledgeManager.value.aggregateProjectionObservation]
            : []),
        ];
        const targets = observations.flatMap((observation) => observation.targets);
        const nativeLocations = combineNativeLocationOutcomes(
          observations.flatMap((observation) => observation.nativeLocations ?? []),
        );
        return {
          result: "success",
          message: "Rendered shared aggregate units from the complete contributor set",
          ...(warnings.length === 0 ? {} : { warnings }),
          artifact: {
            path: targets[0]?.path ?? "instruction files",
            scope: location.scope,
            change: nativeLocations.some((location) =>
              ["created", "updated", "removed"].includes(location.state),
            )
              ? "updated"
              : "unchanged",
            nativeLocations,
          },
        } satisfies JobStepResult;
      }).pipe(Effect.mapError(kernelFailureToStepFailure)),
    });
  });
