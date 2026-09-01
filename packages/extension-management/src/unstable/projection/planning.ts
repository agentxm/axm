/**
 * Shared construction and application of projection plans.
 *
 * A render input is branded with a module-private symbol. Callers can define
 * adapters that consume the input, but only this module can construct one.
 * Aggregate construction first proves the desired-state graph complete. Plan
 * application serializes units that share a target file while retaining
 * concurrency across independent targets.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import type { ExtensionManagerFailure } from "../extension-workspace/errors.js";
import type { DesiredStateGraph } from "@agentxm/workspace-state";
import { requireCompleteGraph } from "./contributors.js";
import type { ProjectionUnitObservation } from "./invariant-facts.js";
import type {
  AggregateOwnershipUnitId,
  OwnershipUnitId,
  SingletonOwnershipUnitId,
} from "./units.js";

const ProjectionRenderInputTypeId: unique symbol = Symbol.for(
  "@agentxm/extension-management/unstable/projection/planning/ProjectionRenderInput",
);
const ProjectionPlanTypeId: unique symbol = Symbol.for(
  "@agentxm/extension-management/unstable/projection/planning/ProjectionPlan",
);

/** Shared semantic decision made before a desired-state-dependent plan is exposed. */
export type DesiredStateGraphPlanningDecision =
  | { readonly readiness: "ready"; readonly graph: DesiredStateGraph }
  | {
      readonly readiness: "blocked";
      readonly problems: DesiredStateGraph["problems"];
    };

/**
 * Classify whether the desired-state graph can safely supply a complete plan.
 * Preview and apply consumers retain this exact decision; apply only checks
 * that the candidate's authoritative inputs have not changed.
 */
export const planDesiredStateGraph = (
  graph: DesiredStateGraph,
): DesiredStateGraphPlanningDecision =>
  graph.complete
    ? { readiness: "ready", graph }
    : { readiness: "blocked", problems: graph.problems };

/** Complete contributor input. Its module-private brand prevents construction by adapters. */
export interface ProjectionRenderInput<Contributor> {
  readonly contributors: ReadonlyArray<Contributor>;
  readonly [ProjectionRenderInputTypeId]: typeof ProjectionRenderInputTypeId;
}

export interface ProjectionAdapter<Contributor, ApplyResult = void> {
  readonly observe: (
    input: ProjectionRenderInput<Contributor>,
  ) => Effect.Effect<ProjectionUnitObservation, ExtensionManagerFailure>;
  readonly apply: (
    input: ProjectionRenderInput<Contributor>,
  ) => Effect.Effect<ApplyResult, ExtensionManagerFailure>;
}

/** Opaque executable plan for one ownership unit and one target file. */
export interface ProjectionPlan<ApplyResult = void> {
  readonly unitId: OwnershipUnitId;
  readonly targetFile: string;
  readonly [ProjectionPlanTypeId]: {
    readonly observe: Effect.Effect<ProjectionUnitObservation, ExtensionManagerFailure>;
    readonly apply: Effect.Effect<ApplyResult, ExtensionManagerFailure>;
  };
}

const makeRenderInput = <Contributor>(
  contributors: ReadonlyArray<Contributor>,
): ProjectionRenderInput<Contributor> => ({
  contributors,
  [ProjectionRenderInputTypeId]: ProjectionRenderInputTypeId,
});

const makePlan = <Contributor, ApplyResult>(args: {
  readonly unitId: OwnershipUnitId;
  readonly targetFile: string;
  readonly contributors: ReadonlyArray<Contributor>;
  readonly adapter: ProjectionAdapter<Contributor, ApplyResult>;
}): ProjectionPlan<ApplyResult> => {
  const input = makeRenderInput(args.contributors);
  return {
    unitId: args.unitId,
    targetFile: args.targetFile,
    [ProjectionPlanTypeId]: {
      observe: args.adapter.observe(input),
      apply: args.adapter.apply(input),
    },
  };
};

/** Construct one aggregate-unit plan only after graph completeness is proven. */
export const planAggregateProjection = <Contributor, ApplyResult>(args: {
  readonly unitId: AggregateOwnershipUnitId;
  readonly targetFile: string;
  readonly graph: DesiredStateGraph;
  readonly select: (
    graph: DesiredStateGraph,
  ) => Effect.Effect<ReadonlyArray<Contributor>, ExtensionManagerFailure>;
  readonly adapter: ProjectionAdapter<Contributor, ApplyResult>;
}): Effect.Effect<ProjectionPlan<ApplyResult>, ExtensionManagerFailure> =>
  requireCompleteGraph(args.graph).pipe(
    Effect.flatMap(args.select),
    Effect.map((contributors) => makePlan({ ...args, contributors })),
  );

/** Construct a single-contributor plan through the same opaque input contract. */
export const planSingletonProjection = <Contributor, ApplyResult>(args: {
  readonly unitId: SingletonOwnershipUnitId;
  readonly targetFile: string;
  readonly contributor: Contributor;
  readonly adapter: ProjectionAdapter<Contributor, ApplyResult>;
}): ProjectionPlan<ApplyResult> => makePlan({ ...args, contributors: [args.contributor] });

/** Observe planned units without applying their writes. */
export const observeProjectionPlans = (
  plans: ReadonlyArray<ProjectionPlan>,
): Effect.Effect<ReadonlyArray<ProjectionUnitObservation>, ExtensionManagerFailure> =>
  Effect.forEach(plans, (plan) => plan[ProjectionPlanTypeId].observe, {
    concurrency: "unbounded",
  });

/**
 * Apply plans concurrently across target files and sequentially within each
 * target. This is the only function that can reach a plan's write effect.
 */
export const applyProjectionPlans = (
  plans: ReadonlyArray<ProjectionPlan>,
): Effect.Effect<void, ExtensionManagerFailure> =>
  applyProjectionPlansWithResults(plans).pipe(Effect.asVoid);

/** Apply same-result plans with target serialization and preserve input order. */
export const applyProjectionPlansWithResults = <ApplyResult>(
  plans: ReadonlyArray<ProjectionPlan<ApplyResult>>,
): Effect.Effect<ReadonlyArray<ApplyResult>, ExtensionManagerFailure> => {
  const byTarget = new Map<
    string,
    Array<{ readonly index: number; readonly plan: ProjectionPlan<ApplyResult> }>
  >();
  for (const [index, plan] of plans.entries()) {
    const existing = byTarget.get(plan.targetFile);
    const indexed = { index, plan };
    if (existing === undefined) byTarget.set(plan.targetFile, [indexed]);
    else existing.push(indexed);
  }
  return Effect.forEach(
    byTarget.values(),
    (targetPlans) =>
      Effect.forEach(
        targetPlans,
        ({ index, plan }) =>
          plan[ProjectionPlanTypeId].apply.pipe(Effect.map((result) => ({ index, result }))),
        {
          concurrency: 1,
        },
      ),
    { concurrency: "unbounded" },
  ).pipe(
    Effect.map((groups) =>
      groups
        .flat()
        .sort((left, right) => left.index - right.index)
        .map(({ result }) => result),
    ),
  );
};

/** Build and apply the plans exposed by a projection-planning participant. */
export const applyPlannedProjections = (participant: {
  readonly projectionPlans: () => Effect.Effect<
    ReadonlyArray<ProjectionPlan>,
    ExtensionManagerFailure
  >;
}): Effect.Effect<void, ExtensionManagerFailure> =>
  participant.projectionPlans().pipe(Effect.flatMap(applyProjectionPlans));
