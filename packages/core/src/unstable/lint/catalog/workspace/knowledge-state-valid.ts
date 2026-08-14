/** Reports invalid observed state for desired Knowledge bundles. */

import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import type { WorkspaceRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule } from "../../rule.js";

const RULE_ID = "workspace/knowledge-state-valid";

export const knowledgeStateValidRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Desired Knowledge content has usable canonical state.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.gen(function* () {
      if (context.health?.canonicalObservations === undefined) return [];
      const observations = yield* Effect.result(context.health.canonicalObservations);
      if (Result.isFailure(observations)) return [];
      return observations.success.flatMap(
        ({ desired, observation }): ReadonlyArray<AdvisoryFinding> => {
          if (
            desired.type !== "knowledge" ||
            observation.status === "usable" ||
            observation.status === "not-applicable" ||
            observation.status === "locally-modified"
          ) {
            return [];
          }
          return [
            {
              kind: "advisory",
              ruleId: RULE_ID,
              severity: "error",
              message: `Knowledge bundle '${desired.name}' has canonical state ${observation.status}.`,
              location: { file: observation.path ?? ".axm/settings.json" },
            },
          ];
        },
      );
    }),
};
