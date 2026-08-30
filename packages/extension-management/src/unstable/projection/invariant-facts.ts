/**
 * Shared invariant-fact evaluation for AXM-owned projection units.
 *
 * Adapters read their native output and report a normalized observation here.
 * Lint and sync consume the resulting facts without repeating adapter probes.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as ServiceMap from "effect/Context";
import { HOOK_FALLBACKS_REGION_OWNER, HookManager } from "../hooks/manager.js";
import { KNOWLEDGE_REGION_OWNER } from "../knowledge/discovery.js";
import { KnowledgeManager } from "../knowledge/manager.js";
import { RULES_REGION_OWNER, RuleManager } from "../rules/manager.js";
import type { AppError } from "../app-error/index.js";
import { WorkspaceMutations } from "../workspace/service-interface.js";
import { acceptedResolutionRef } from "../workspace/accepted-canonical-ref.js";
import { resolveWorkspaceExtensionRef } from "../workspace/configured-entry-resolution/workspace-ref.js";
import { SubagentManager } from "../subagents/manager.js";
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
  /** Marker provenance owner for comment-bearing managed-region units. */
  readonly owner?: string;
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
    readonly owner?: string;
  };
  readonly authority: {
    readonly source: "desired-state-graph";
    readonly contributors: ReadonlyArray<string>;
  };
  readonly observation: {
    readonly status: ProjectionObservationStatus;
    readonly contributors: ReadonlyArray<string>;
    readonly reasonCode?: string;
    readonly message?: string;
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
  readonly owner?: string;
  readonly error?: AppError;
}): ProjectionInvariantFact => {
  const contributors = uniqueSorted(args.expectedContributors);
  return {
    predicate: PROJECTION_INVARIANT_PREDICATE,
    subject: {
      unitId: args.unitId,
      path: args.path,
      scope: args.scope,
      ...(args.owner === undefined ? {} : { owner: args.owner }),
    },
    authority: { source: "desired-state-graph", contributors },
    observation: {
      status: "unavailable",
      contributors: [],
      ...(args.error === undefined
        ? {}
        : {
            reasonCode: args.error.detail.includes("upgrade AXM")
              ? "unsupported-version"
              : "unavailable",
            message: args.error.detail,
          }),
    },
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
    subject: {
      unitId: unit.unitId,
      path: unit.path,
      scope,
      ...(unit.owner === undefined ? {} : { owner: unit.owner }),
    },
    authority: { source: "desired-state-graph", contributors: expectedContributors },
    observation: { status, contributors: observedContributors },
    expectation: { status: "current", contributors: expectedContributors },
    affectedContributors,
  };
};

export const projectionFactIsViolation = (fact: ProjectionInvariantFact): boolean =>
  fact.observation.status !== "current" &&
  (fact.observation.status !== "unavailable" ||
    fact.observation.reasonCode === "unsupported-version");

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
>()("@agentxm/extension-management/unstable/projection/invariant-facts/WorkspaceInvariantFacts") {}

export const WorkspaceInvariantFactsLive = Layer.effect(
  WorkspaceInvariantFacts,
  Effect.gen(function* () {
    const workspace = yield* WorkspaceMutations;
    const rules = yield* RuleManager;
    const hooks = yield* HookManager;
    const knowledge = yield* KnowledgeManager;
    const subagents = yield* SubagentManager;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const fsPathLayer = Layer.mergeAll(
      Layer.succeed(FileSystem.FileSystem, fs),
      Layer.succeed(Path.Path, path),
    );
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
        const graph = yield* Effect.result(workspace.getDesiredStateGraph());
        if (Result.isSuccess(graph) && graph.success.complete) {
          const subagentFacts = yield* Effect.forEach(
            graph.success.nodes.filter((node) => node.type === "subagent" && node.enabled),
            (node) =>
              Effect.result(
                (node.source === "workspace"
                  ? resolveWorkspaceExtensionRef({
                      settingsName: node.name,
                      source: node.source,
                      expectedType: "subagent",
                      layout: workspace.layout,
                      scope: workspace.scope,
                    }).pipe(Effect.map(Option.some))
                  : acceptedResolutionRef({
                      workspace,
                      type: "subagent",
                      name: node.name,
                    })
                ).pipe(
                  Effect.provide(fsPathLayer),
                  Effect.flatMap(
                    Option.match({
                      onNone: () => Effect.succeed(Option.none<ProjectionInvariantFact>()),
                      onSome: (ref) =>
                        ref.type !== "subagent"
                          ? Effect.succeed(Option.none<ProjectionInvariantFact>())
                          : subagents.projectionObservation(ref).pipe(
                              Effect.map((observation) =>
                                Option.some(
                                  makeProjectionInvariantFact(
                                    {
                                      unitId: "subagent:native-profile",
                                      path: `subagent:${node.name}`,
                                      present: observation.present,
                                      current: observation.current,
                                      expectedContributors: [node.identity],
                                      observedContributors: observation.present
                                        ? [node.identity]
                                        : [],
                                    },
                                    workspace.scope,
                                  ),
                                ),
                              ),
                            ),
                    }),
                  ),
                ),
              ),
          );
          facts.push(
            ...subagentFacts.flatMap((result) =>
              Result.isSuccess(result) && Option.isSome(result.success)
                ? [result.success.value]
                : [],
            ),
          );
        }
        if (
          Result.isSuccess(ruleResult) &&
          Result.isSuccess(hookResult) &&
          Result.isSuccess(knowledgeResult)
        )
          return facts;

        if (Result.isFailure(graph) || !graph.success.complete) return facts;
        const contributorsFor = (type: "rule" | "hook" | "knowledge"): ReadonlyArray<string> =>
          graph.success.nodes
            .filter((node) => node.type === type && node.enabled)
            .map(({ identity }) => identity);
        if (Result.isFailure(ruleResult)) {
          const contributors = contributorsFor("rule");
          facts.push(
            makeUnavailableProjectionFact({
              unitId: "rule:instructions-region",
              path: "managed Rules region",
              scope: workspace.scope,
              expectedContributors: contributors,
              owner: RULES_REGION_OWNER,
              error: ruleResult.failure,
            }),
          );
        }
        if (Result.isFailure(hookResult)) {
          const contributors = contributorsFor("hook");
          facts.push(
            makeUnavailableProjectionFact({
              unitId: "hook:agent-hook-entries",
              path: "managed hook projections",
              scope: workspace.scope,
              expectedContributors: contributors,
              error: hookResult.failure,
            }),
          );
          facts.push(
            makeUnavailableProjectionFact({
              unitId: "hook:fallback-region",
              path: "managed Hook fallback region",
              scope: workspace.scope,
              expectedContributors: contributors,
              owner: HOOK_FALLBACKS_REGION_OWNER,
              error: hookResult.failure,
            }),
          );
        }
        if (Result.isFailure(knowledgeResult)) {
          const contributors = contributorsFor("knowledge");
          facts.push(
            makeUnavailableProjectionFact({
              unitId: "knowledge:discovery-region",
              path: "managed Knowledge discovery region",
              scope: workspace.scope,
              expectedContributors: contributors,
              owner: KNOWLEDGE_REGION_OWNER,
              error: knowledgeResult.failure,
            }),
          );
        }
        return facts;
      }),
    };
  }),
);
