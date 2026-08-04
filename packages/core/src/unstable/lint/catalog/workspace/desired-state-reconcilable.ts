import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import { isWorkspaceSourceLocator } from "../../../sources/index.js";
import type { WorkspaceRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule } from "../../rule.js";

const RULE_ID = "workspace/desired-state-reconcilable";

export const desiredStateReconcilableRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Known local desired-state blockers are repaired before reconciliation.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.gen(function* () {
      if (context.health === undefined) return [];
      const graph = yield* Effect.result(context.health.desiredState);
      if (Result.isFailure(graph)) return [];
      const graphFindings = graph.success.problems.map((problem): AdvisoryFinding => {
        if ("pack" in problem) {
          const recovery =
            problem.type === "pack-canonical-unusable" || problem.type === "pack-trust-unavailable"
              ? ` Run \`axm packs repair ${problem.pack} --preview\` to inspect the supported recovery.`
              : "";
          const observed =
            problem.type === "pack-canonical-unusable"
              ? ` Canonical state: ${problem.status}.`
              : "";
          return {
            kind: "advisory",
            ruleId: RULE_ID,
            severity: "error",
            message: `Pack '${problem.pack}' blocks desired-state reconciliation.${observed}${recovery}`,
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
          const recovery =
            observation.type === "pack" && observation.status === "locally-modified"
              ? ` Run \`axm packs repair ${observation.name} --preview\` to inspect the supported recovery.`
              : observation.status === "locally-modified"
                ? ` Review \`axm sync ${identity} --dry-run\`; applying sync restores trusted source content and discards these local modifications.`
                : " Run `axm status` to inspect the blocking local state.";
          return [
            {
              kind: "advisory",
              ruleId: RULE_ID,
              severity: "error",
              message: `${label} has canonical state ${observation.status}.${recovery}`,
              location: { file: observation.path ?? ".axm/settings.json" },
            },
          ];
        },
      );
      return [...graphFindings, ...observationFindings];
    }),
};
