import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import { isWorkspaceSourceLocator } from "../../../sources/index.js";
import type { WorkspaceRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule } from "../../rule.js";

const RULE_ID = "workspace/desired-state-reconcilable";

export const desiredStateReconcilableRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Desired-state declarations and observations are mutually reconcilable.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.gen(function* () {
      if (context.health === undefined) return [];
      const graph = yield* Effect.result(context.health.desiredState);
      if (Result.isFailure(graph)) return [];
      const graphFindings = graph.success.problems.map((problem): AdvisoryFinding => {
        if ("pack" in problem) {
          const observed =
            problem.type === "pack-manifest-content-mismatch"
              ? ` Canonical state: ${problem.status}.`
              : "";
          return {
            kind: "advisory",
            ruleId: RULE_ID,
            severity: "error",
            message: `Pack '${problem.pack}' does not currently form a reconcilable desired-state route.${observed}`,
            location: { file: ".axm/settings.json" },
          };
        }
        return {
          kind: "advisory",
          ruleId: RULE_ID,
          severity: "error",
          message:
            problem.type === "projection-collision"
              ? `${problem.extensionType} '${problem.name}' has competing desired identities: ${problem.identities.join(", ")}.`
              : `${problem.extensionType} '${problem.name}' has incompatible constraints: ${problem.constraints.join(", ")}.`,
          location: { file: ".axm/settings.json" },
        };
      });
      if (context.health.canonicalObservations === undefined) return graphFindings;
      const observations = yield* Effect.result(context.health.canonicalObservations);
      if (Result.isFailure(observations)) return graphFindings;
      const observationFindings = observations.success.flatMap(
        ({ desired, observation }): ReadonlyArray<AdvisoryFinding> => {
          if (
            observation.status === "usable" ||
            observation.status === "not-applicable" ||
            observation.status === "missing"
          ) {
            return [];
          }
          const identity = desired.identity.replace(/^workspace:/, "");
          const label = `${observation.type} '${identity}'`;
          if (
            observation.status === "locally-modified" &&
            isWorkspaceSourceLocator(desired.source)
          ) {
            return [];
          }
          return [
            {
              kind: "advisory",
              ruleId: RULE_ID,
              severity: "error",
              message: `${label} has canonical state ${observation.status}.`,
              location: { file: observation.path ?? ".axm/settings.json" },
            },
          ];
        },
      );
      return [...graphFindings, ...observationFindings];
    }),
};
