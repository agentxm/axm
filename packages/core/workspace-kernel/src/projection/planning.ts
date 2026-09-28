/**
 * Shared construction and application of projection plans.
 *
 * A render input is branded with a module-private symbol. Callers can define
 * adapters that consume the input, but only this module can construct one.
 * Aggregate construction first proves the unit's contributor set complete.
 * Plan application serializes units that share a target file while retaining
 * concurrency across independent targets.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import { desiredStateSettled, type DesiredStateGraph } from "../workspace-state/index.js";
import { requireCompleteContributors } from "./contributors.js";
import { formatProjectionExclusions, type ProjectionContributorExclusion } from "./exclusions.js";
import type { DesiredStateIncomplete, ProjectionError } from "./errors.js";
import {
  ownershipUnits,
  type AggregateOwnershipUnitId,
  type OwnershipUnitId,
  type ProjectionUnitObservation,
  type SingletonOwnershipUnitId,
} from "./units.js";

const ProjectionRenderInputTypeId: unique symbol = Symbol.for(
  "@agentxm/workspace-kernel/projection/planning/ProjectionRenderInput",
);
const ProjectionPlanTypeId: unique symbol = Symbol.for(
  "@agentxm/workspace-kernel/projection/planning/ProjectionPlan",
);

// Projection observation and application use the same local filesystem as the
// workspace scanners. Their measured allowance is sixteen concurrent reads.
export const PROJECTION_IO_CONCURRENCY = 16;

/** The whole-graph decision a Pack transition makes before it is exposed. */
export type DesiredStateGraphPlanningDecision =
  | { readonly readiness: "ready"; readonly graph: DesiredStateGraph }
  | {
      readonly readiness: "blocked";
      readonly problems: DesiredStateGraph["problems"];
    };

/**
 * Classify whether the whole desired-state graph is settled enough for a
 * Pack transition, which changes the graph itself: any problem blocks it.
 * This is deliberately the blanket decision; an operation acting on one
 * extension or one unit asks the narrower query that matches its decision.
 * Preview and apply consumers retain this exact decision; apply only checks
 * that the candidate's authoritative inputs have not changed.
 */
export const planDesiredStateGraph = (
  graph: DesiredStateGraph,
): DesiredStateGraphPlanningDecision =>
  desiredStateSettled(graph)
    ? { readiness: "ready", graph }
    : { readiness: "blocked", problems: graph.problems };

/** The extension type whose contributor set an ownership unit renders. */
const unitContributorType = (unitId: OwnershipUnitId) => {
  const unit = ownershipUnits.find((candidate) => candidate.unitId === unitId);
  if (unit === undefined) throw new Error(`Unregistered ownership unit ${unitId}`);
  return unit.type;
};

/** Complete contributor input. Its module-private brand prevents construction by adapters. */
export interface ProjectionRenderInput<Contributor> {
  readonly contributors: ReadonlyArray<Contributor>;
  readonly [ProjectionRenderInputTypeId]: typeof ProjectionRenderInputTypeId;
}

/**
 * A selector's answer: the contributors that can be rendered, and the desired
 * contributors that cannot. Excluding a contributor is a rendering decision,
 * so the selector reports it rather than failing the whole unit.
 */
export interface ProjectionSelection<Contributor> {
  readonly contributors: ReadonlyArray<Contributor>;
  readonly exclusions: ReadonlyArray<ProjectionContributorExclusion>;
}

/**
 * An adapter's failure channel is its own. Projection never names the
 * producing capability's failure family, so every plan carries it as `E`.
 */
export interface ProjectionAdapter<
  Contributor,
  ApplyResult = void,
  E = ProjectionError,
  R = never,
> {
  readonly observe: (
    input: ProjectionRenderInput<Contributor>,
  ) => Effect.Effect<ProjectionUnitObservation, E, R>;
  readonly apply: (input: ProjectionRenderInput<Contributor>) => Effect.Effect<ApplyResult, E, R>;
}

/** Opaque executable plan for one ownership unit and one target file. */
export interface ProjectionPlan<ApplyResult = void, E = ProjectionError, R = never> {
  readonly unitId: OwnershipUnitId;
  readonly targetFile: string;
  /** Desired contributors this plan cannot render. Informational; read freely. */
  readonly exclusions: ReadonlyArray<ProjectionContributorExclusion>;
  readonly [ProjectionPlanTypeId]: {
    readonly observe: Effect.Effect<ProjectionUnitObservation, E, R>;
    readonly apply: Effect.Effect<ApplyResult, E, R>;
  };
}

const makeRenderInput = <Contributor>(
  contributors: ReadonlyArray<Contributor>,
): ProjectionRenderInput<Contributor> => ({
  contributors,
  [ProjectionRenderInputTypeId]: ProjectionRenderInputTypeId,
});

const makePlan = <Contributor, ApplyResult, E, R>(args: {
  readonly unitId: OwnershipUnitId;
  readonly targetFile: string;
  readonly contributors: ReadonlyArray<Contributor>;
  readonly exclusions: ReadonlyArray<ProjectionContributorExclusion>;
  readonly adapter: ProjectionAdapter<Contributor, ApplyResult, E, R>;
}): ProjectionPlan<ApplyResult, E, R> => {
  const input = makeRenderInput(args.contributors);
  return {
    unitId: args.unitId,
    targetFile: args.targetFile,
    exclusions: args.exclusions,
    [ProjectionPlanTypeId]: {
      // Observation carries the same exclusions the plan reports, so lint and
      // sync read them from the fact without re-deriving the contributor set.
      observe: args.adapter
        .observe(input)
        .pipe(
          Effect.map((observation) =>
            args.exclusions.length === 0
              ? observation
              : { ...observation, exclusions: args.exclusions },
          ),
        ),
      apply: args.adapter.apply(input),
    },
  };
};

/** Construct one aggregate-unit plan only after the unit's contributor set is proven complete. */
export const planAggregateProjection = <
  Contributor,
  ApplyResult,
  ESelect,
  EAdapt,
  RSelect = never,
  RAdapt = never,
>(args: {
  readonly unitId: AggregateOwnershipUnitId;
  readonly targetFile: string;
  readonly graph: DesiredStateGraph;
  readonly select: (
    graph: DesiredStateGraph,
  ) => Effect.Effect<ProjectionSelection<Contributor>, ESelect, RSelect>;
  readonly adapter: ProjectionAdapter<Contributor, ApplyResult, EAdapt, RAdapt>;
}): Effect.Effect<
  ProjectionPlan<ApplyResult, EAdapt, RAdapt>,
  ESelect | DesiredStateIncomplete,
  RSelect
> =>
  requireCompleteContributors(args.graph, unitContributorType(args.unitId)).pipe(
    Effect.flatMap(args.select),
    Effect.map((selection) => makePlan({ ...args, ...selection })),
  );

/** Construct a single-contributor plan through the same opaque input contract. */
export const planSingletonProjection = <Contributor, ApplyResult, E, R = never>(args: {
  readonly unitId: SingletonOwnershipUnitId;
  readonly targetFile: string;
  readonly contributor: Contributor;
  readonly adapter: ProjectionAdapter<Contributor, ApplyResult, E, R>;
}): ProjectionPlan<ApplyResult, E, R> =>
  makePlan({ ...args, contributors: [args.contributor], exclusions: [] });

/**
 * Restate a plan's failure channel in another vocabulary, keeping the plan
 * opaque. An owner registering with the participant registry uses this to
 * present its own failure family as {@link ProjectionParticipantFailure}.
 */
export const mapProjectionPlanFailure = <ApplyResult, E, E2, R>(
  plan: ProjectionPlan<ApplyResult, E, R>,
  onFailure: (failure: E) => E2,
): ProjectionPlan<ApplyResult, E2, R> => ({
  unitId: plan.unitId,
  targetFile: plan.targetFile,
  exclusions: plan.exclusions,
  [ProjectionPlanTypeId]: {
    observe: plan[ProjectionPlanTypeId].observe.pipe(Effect.mapError(onFailure)),
    apply: plan[ProjectionPlanTypeId].apply.pipe(Effect.mapError(onFailure)),
  },
});

/** Operator-facing reports for every contributor the given plans cannot render. */
export const projectionPlanExclusionWarnings = <ApplyResult, E, R>(
  plans: ReadonlyArray<ProjectionPlan<ApplyResult, E, R>>,
): ReadonlyArray<string> =>
  plans.flatMap((plan) =>
    formatProjectionExclusions({ exclusions: plan.exclusions, targetFile: plan.targetFile }),
  );

/** Observe planned units without applying their writes. */
export const observeProjectionPlans = <E, R>(
  plans: ReadonlyArray<ProjectionPlan<void, E, R>>,
): Effect.Effect<ReadonlyArray<ProjectionUnitObservation>, E, R> =>
  Effect.forEach(plans, (plan) => plan[ProjectionPlanTypeId].observe, {
    concurrency: PROJECTION_IO_CONCURRENCY,
  });

/**
 * Apply plans concurrently across target files and sequentially within each
 * target. This is the only function that can reach a plan's write effect.
 */
export const applyProjectionPlans = <E, R>(
  plans: ReadonlyArray<ProjectionPlan<void, E, R>>,
): Effect.Effect<void, E, R> => applyProjectionPlansWithResults(plans).pipe(Effect.asVoid);

/** Apply same-result plans with target serialization and preserve input order. */
export const applyProjectionPlansWithResults = <ApplyResult, E, R>(
  plans: ReadonlyArray<ProjectionPlan<ApplyResult, E, R>>,
): Effect.Effect<ReadonlyArray<ApplyResult>, E, R> => {
  const byTarget = new Map<
    string,
    Array<{ readonly index: number; readonly plan: ProjectionPlan<ApplyResult, E, R> }>
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
    { concurrency: PROJECTION_IO_CONCURRENCY },
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
export const applyPlannedProjections = <E, R>(participant: {
  readonly projectionPlans: () => Effect.Effect<ReadonlyArray<ProjectionPlan<void, E, R>>, E, R>;
}): Effect.Effect<ReadonlyArray<string>, E, R> =>
  participant
    .projectionPlans()
    .pipe(
      Effect.flatMap((plans) =>
        applyProjectionPlans(plans).pipe(Effect.as(projectionPlanExclusionWarnings(plans))),
      ),
    );
