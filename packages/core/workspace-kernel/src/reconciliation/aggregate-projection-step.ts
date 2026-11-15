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
  type RuleManagerService,
} from "../materialization/index.js";
import {
  applyObservedInstructionSurfacePlans,
  combineObservedProjectionPlans,
  type ObservedProjectionPlans,
} from "../projection/index.js";
import { WorkspaceLocation } from "../workspace-state/index.js";
import { combineNativeLocationOutcomes } from "../locations/index.js";
import { kernelFailureToStepFailure } from "./failure-rendering.js";
import type { InstallStepRequirements } from "./install-vocabulary.js";

type ManagerObservedPlans = ObservedProjectionPlans<ExtensionManagerFailure, ManagerRequirements>;

/** A shared aggregate unit's owner, and the options its plans are built with. */
interface AggregateUnitOwner {
  readonly manager: Pick<RuleManagerService, "observedProjectionPlans">;
  readonly options?: NativeProjectionOptions | undefined;
}

/**
 * Build every owner's plans in order, each owner observing its own plans as
 * its pre-write refusal, and hand the combined observations to `use`. Every
 * owner's call stays open until `use` ends, so `use` takes the observations
 * before it writes.
 */
export const withAggregateObservedPlans = <A, E, R>(
  owners: ReadonlyArray<AggregateUnitOwner>,
  use: (observed: ManagerObservedPlans) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E | ExtensionManagerFailure, R | ManagerRequirements> => {
  const from = (
    index: number,
    parts: ReadonlyArray<ManagerObservedPlans>,
  ): Effect.Effect<A, E | ExtensionManagerFailure, R | ManagerRequirements> => {
    const owner = owners[index];
    return owner === undefined
      ? use(combineObservedProjectionPlans(parts))
      : owner.manager.observedProjectionPlans(owner.options, (observed) =>
          from(index + 1, [...parts, observed]),
        );
  };
  return from(0, []);
};

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
        const warnings = yield* withAggregateObservedPlans(
          [
            ...Option.toArray(
              Option.map(ruleManager, (manager) => ({
                manager,
                options: args.nativeProjections?.rule,
              })),
            ),
            ...Option.toArray(
              Option.map(hookManager, (manager) => ({
                manager,
                options: args.nativeProjections?.hook,
              })),
            ),
            ...Option.toArray(
              Option.map(knowledgeManager, (manager) => ({
                manager,
                options: args.nativeProjections?.knowledge,
              })),
            ),
          ],
          applyObservedInstructionSurfacePlans,
        );
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
