/**
 * Which workspace rule reports each desired node's canonical observation.
 *
 * Every desired node is observed once per lint run, and an observation that
 * is a violation is reported by exactly one rule, so one fact yields one
 * finding. A fact the desired-state graph already reports as a problem, or
 * one a constraint conflict makes unreliable, is not reported again.
 */

import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import type {
  CanonicalObservation,
  DesiredExtensionNode,
  DesiredStateGraph,
} from "../../../desired-state/index.js";
import type { WorkspaceRuleContext } from "../../workspace-context.js";

type ObservationRuleId =
  | "workspace/configured-but-not-installed"
  | "workspace/desired-state-reconcilable"
  | "workspace/knowledge-state-valid"
  | "workspace/packs-dependencies-resolved"
  | "workspace/skills-lockfile-aligned";

interface ObservedDesiredNode {
  readonly desired: DesiredExtensionNode;
  readonly observation: CanonicalObservation;
}

/** Whether the graph already reports this node's observation as one of its own problems. */
const reportedByGraph = (
  graph: DesiredStateGraph,
  { desired, observation }: ObservedDesiredNode,
): boolean =>
  graph.problems.some((problem) => {
    switch (problem.type) {
      case "constraint-conflict":
        return (
          observation.status === "constraint-mismatch" &&
          problem.extensionType === desired.type &&
          problem.name === desired.name
        );
      case "pack-resolution-unavailable":
        return desired.type === "pack" && problem.pack === desired.identity;
      default:
        return false;
    }
  });

/**
 * The one rule that reports an observation, or `undefined` when it is no
 * violation. Absent canonical content with an accepted resolution is reported
 * by the rule that owns configured-but-absent content, whatever the node's
 * activation, because sync realizes a disabled node's content too.
 */
const observationRule = (
  graph: DesiredStateGraph,
  observed: ObservedDesiredNode,
): ObservationRuleId | undefined => {
  const { desired, observation } = observed;
  if (
    observation.status === "usable" ||
    observation.status === "not-applicable" ||
    reportedByGraph(graph, observed)
  ) {
    return undefined;
  }
  if (observation.status === "missing") return "workspace/configured-but-not-installed";
  if (observation.status === "missing-resolution") {
    if (desired.origins.some((origin) => origin.type === "pack")) {
      return "workspace/packs-dependencies-resolved";
    }
    if (desired.type === "skill") return "workspace/skills-lockfile-aligned";
  }
  if (desired.type === "knowledge" && observation.status !== "constraint-mismatch") {
    return "workspace/knowledge-state-valid";
  }
  return "workspace/desired-state-reconcilable";
};

/** The observations one rule reports; none when health facts are unavailable. */
export const observationsReportedBy = (
  context: WorkspaceRuleContext,
  ruleId: ObservationRuleId,
): Effect.Effect<ReadonlyArray<ObservedDesiredNode>> =>
  Effect.gen(function* () {
    if (context.health?.canonicalObservations === undefined) return [];
    const [graph, observations] = yield* Effect.all([
      Effect.result(context.health.desiredState),
      Effect.result(context.health.canonicalObservations),
    ]);
    if (Result.isFailure(graph) || Result.isFailure(observations)) return [];
    return observations.success.filter(
      (observed) => observationRule(graph.success, observed) === ruleId,
    );
  });
