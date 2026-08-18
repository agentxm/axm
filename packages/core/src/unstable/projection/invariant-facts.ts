/**
 * Shared invariant-fact evaluation for AXM-owned projection units.
 *
 * Adapters read their native output and report a normalized observation here.
 * Lint and sync consume the resulting facts without repeating adapter probes.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Result from "effect/Result";
import * as ServiceMap from "effect/Context";
import { HookManager } from "../hooks/manager.js";
import { KnowledgeManager } from "../knowledge/manager.js";
import { RuleManager } from "../rules/manager.js";
import { WorkspaceMutations } from "../workspace/service-interface.js";
import type { WorkspaceScope } from "../workspace/scope.js";
import type { OwnershipUnitId } from "./units.js";
import { observeProjectionPlans } from "./planning.js";

export const PROJECTION_INVARIANT_PREDICATE = "workspace/projection-current" as const;

export type ProjectionObservationStatus =
  "current" | "missing" | "incomplete" | "stale" | "obsolete" | "unavailable";

/** Adapter readback from one independently owned output unit. */
export interface ProjectionUnitObservation {
  readonly unitId: OwnershipUnitId;
  readonly path: string;
  /** Whether the AXM-owned unit itself is present, not merely its surrounding file. */
  readonly present: boolean;
  /** Whether the complete expected rendering byte-for-byte matches the output. */
  readonly current: boolean;
  readonly expectedContributors: ReadonlyArray<string>;
  /** Contributor identities recovered from the output unit itself. */
  readonly observedContributors: ReadonlyArray<string>;
}

export interface ProjectionInvariantFact {
  readonly predicate: typeof PROJECTION_INVARIANT_PREDICATE;
  readonly subject: {
    readonly unitId: OwnershipUnitId;
    readonly path: string;
    readonly scope: WorkspaceScope;
  };
  readonly authority: {
    readonly source: "desired-state-graph";
    readonly contributors: ReadonlyArray<string>;
  };
  readonly observation: {
    readonly status: ProjectionObservationStatus;
    readonly contributors: ReadonlyArray<string>;
  };
  readonly expectation: {
    readonly status: "current";
    readonly contributors: ReadonlyArray<string>;
  };
  readonly affectedContributors: ReadonlyArray<string>;
}

const uniqueSorted = (values: ReadonlyArray<string>): ReadonlyArray<string> =>
  Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));

const makeUnavailableProjectionFact = (args: {
  readonly unitId: OwnershipUnitId;
  readonly path: string;
  readonly scope: WorkspaceScope;
  readonly expectedContributors: ReadonlyArray<string>;
}): ProjectionInvariantFact => {
  const contributors = uniqueSorted(args.expectedContributors);
  return {
    predicate: PROJECTION_INVARIANT_PREDICATE,
    subject: { unitId: args.unitId, path: args.path, scope: args.scope },
    authority: { source: "desired-state-graph", contributors },
    observation: { status: "unavailable", contributors: [] },
    expectation: { status: "current", contributors },
    affectedContributors: contributors,
  };
};

const observationStatus = (observation: ProjectionUnitObservation): ProjectionObservationStatus => {
  if (observation.current) return "current";
  if (observation.expectedContributors.length === 0) return "obsolete";
  if (!observation.present) return "missing";
  const observedExpected = observation.observedContributors.filter((contributor) =>
    observation.expectedContributors.includes(contributor),
  );
  if (
    observedExpected.length > 0 &&
    observedExpected.length < observation.expectedContributors.length
  ) {
    return "incomplete";
  }
  return "stale";
};

export const makeProjectionInvariantFact = (
  unit: ProjectionUnitObservation,
  scope: WorkspaceScope,
): ProjectionInvariantFact => {
  const expectedContributors = uniqueSorted(unit.expectedContributors);
  const observedContributors = uniqueSorted(unit.observedContributors);
  const status = observationStatus({
    ...unit,
    expectedContributors,
    observedContributors,
  });
  const affectedContributors =
    status === "incomplete" || status === "missing"
      ? expectedContributors.filter((contributor) => !observedContributors.includes(contributor))
      : status === "current"
        ? []
        : uniqueSorted([...expectedContributors, ...observedContributors]);
  return {
    predicate: PROJECTION_INVARIANT_PREDICATE,
    subject: { unitId: unit.unitId, path: unit.path, scope },
    authority: { source: "desired-state-graph", contributors: expectedContributors },
    observation: { status, contributors: observedContributors },
    expectation: { status: "current", contributors: expectedContributors },
    affectedContributors,
  };
};

export const projectionFactIsViolation = (fact: ProjectionInvariantFact): boolean =>
  fact.observation.status !== "current" && fact.observation.status !== "unavailable";

/** Sync work implied by an intrinsic violation or an unready required unit. */
export const projectionFactRequiresReconciliation = (fact: ProjectionInvariantFact): boolean =>
  projectionFactIsViolation(fact) ||
  (fact.observation.status === "unavailable" && fact.expectation.contributors.length > 0);

export interface WorkspaceInvariantFactsService {
  readonly projectionFacts: Effect.Effect<ReadonlyArray<ProjectionInvariantFact>>;
}

export class WorkspaceInvariantFacts extends ServiceMap.Service<
  WorkspaceInvariantFacts,
  WorkspaceInvariantFactsService
>()("@agentxm/client-core/unstable/projection/invariant-facts/WorkspaceInvariantFacts") {}

export const WorkspaceInvariantFactsLive = Layer.effect(
  WorkspaceInvariantFacts,
  Effect.gen(function* () {
    const workspace = yield* WorkspaceMutations;
    const rules = yield* RuleManager;
    const hooks = yield* HookManager;
    const knowledge = yield* KnowledgeManager;
    return {
      projectionFacts: Effect.gen(function* () {
        const [ruleResult, hookResult, knowledgeResult] = yield* Effect.all(
          [
            Effect.result(rules.projectionPlans().pipe(Effect.flatMap(observeProjectionPlans))),
            Effect.result(hooks.projectionPlans().pipe(Effect.flatMap(observeProjectionPlans))),
            Effect.result(knowledge.projectionPlans().pipe(Effect.flatMap(observeProjectionPlans))),
          ],
          { concurrency: "unbounded" },
        );
        const observations = [ruleResult, hookResult, knowledgeResult].flatMap((result) =>
          Result.isSuccess(result) ? result.success : [],
        );
        const facts = observations.map((observation) =>
          makeProjectionInvariantFact(observation, workspace.scope),
        );
        if (
          Result.isSuccess(ruleResult) &&
          Result.isSuccess(hookResult) &&
          Result.isSuccess(knowledgeResult)
        )
          return facts;

        const graph = yield* Effect.result(workspace.getDesiredStateGraph());
        if (Result.isFailure(graph) || !graph.success.complete) return facts;
        const contributorsFor = (type: "rule" | "hook" | "knowledge"): ReadonlyArray<string> =>
          graph.success.nodes
            .filter((node) => node.type === type && node.enabled)
            .map(({ identity }) => identity);
        if (Result.isFailure(ruleResult)) {
          const contributors = contributorsFor("rule");
          if (contributors.length > 0) {
            facts.push(
              makeUnavailableProjectionFact({
                unitId: "rule:instructions-region",
                path: "managed Rules region",
                scope: workspace.scope,
                expectedContributors: contributors,
              }),
            );
          }
        }
        if (Result.isFailure(hookResult)) {
          const contributors = contributorsFor("hook");
          if (contributors.length > 0) {
            facts.push(
              makeUnavailableProjectionFact({
                unitId: "hook:agent-hook-entries",
                path: "managed hook projections",
                scope: workspace.scope,
                expectedContributors: contributors,
              }),
            );
            facts.push(
              makeUnavailableProjectionFact({
                unitId: "hook:fallback-region",
                path: "managed Hook fallback region",
                scope: workspace.scope,
                expectedContributors: contributors,
              }),
            );
          }
        }
        if (Result.isFailure(knowledgeResult)) {
          const contributors = contributorsFor("knowledge");
          if (contributors.length > 0) {
            facts.push(
              makeUnavailableProjectionFact({
                unitId: "knowledge:discovery-region",
                path: "managed Knowledge discovery region",
                scope: workspace.scope,
                expectedContributors: contributors,
              }),
            );
          }
        }
        return facts;
      }),
    };
  }),
);
