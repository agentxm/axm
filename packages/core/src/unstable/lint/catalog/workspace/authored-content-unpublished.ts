import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import { isWorkspaceSourceLocator } from "../../../sources/index.js";
import type { WorkspaceRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule } from "../../rule.js";

const RULE_ID = "workspace/authored-content-unpublished";

export const authoredContentUnpublishedRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Workspace-authored canonical changes are published before they are shared.",
  kind: "advisory",
  severity: "warning",
  check: (context) =>
    Effect.gen(function* () {
      if (context.health?.canonicalObservations === undefined) return [];
      const observations = yield* Effect.result(context.health.canonicalObservations);
      if (Result.isFailure(observations)) return [];
      return observations.success.flatMap(
        ({ desired, observation }): ReadonlyArray<AdvisoryFinding> => {
          if (
            observation.status !== "locally-modified" ||
            !isWorkspaceSourceLocator(desired.source)
          ) {
            return [];
          }
          const identity = desired.identity.replace(/^workspace:/, "");
          return [
            {
              kind: "advisory",
              ruleId: RULE_ID,
              severity: "warning",
              message: `${observation.type} '${identity}' was modified since its last recorded authoring/publish baseline.`,
              location: { file: observation.path ?? ".axm/settings.json" },
              suggestions: [
                {
                  description: "Publish the working version; publishing preserves authored content",
                  cmd: `axm publish ${identity}`,
                },
              ],
            },
          ];
        },
      );
    }),
};
