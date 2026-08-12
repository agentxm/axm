import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";

import type { WorkspaceRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule } from "../../rule.js";

const RULE_ID = "workspace/release-age-exclude-owner-trusted";

export const releaseAgeExcludeOwnerTrustedRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Release-age exclusions trust only the workspace's declared owner.",
  kind: "advisory",
  severity: "warning",
  check: (context) =>
    Effect.gen(function* () {
      if (context.owner === undefined) return [];
      const owner = yield* context.owner;
      if (Option.isNone(owner)) return [];

      const settings = yield* Effect.result(context.workspace.state.settings);
      if (Result.isFailure(settings) || Option.isNone(settings.success)) return [];

      return (settings.success.value.minimumReleaseAgeExclude ?? []).flatMap(
        (pattern): ReadonlyArray<AdvisoryFinding> =>
          pattern.owner === owner.value
            ? []
            : [
                {
                  kind: "advisory",
                  ruleId: RULE_ID,
                  severity: "warning",
                  message: `minimumReleaseAgeExclude trusts ${pattern.owner}, which differs from workspace owner ${owner.value}.`,
                  location: { file: ".axm/settings.json" },
                },
              ],
      );
    }),
};
