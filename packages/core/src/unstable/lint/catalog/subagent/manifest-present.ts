import * as Effect from "effect/Effect";
import type { SubagentRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule } from "../../rule.js";

const RULE_ID = "subagent/manifest-present";
const SUBAGENT_JSON = "subagent.json";

export const manifestPresentRule: AdvisoryRule<SubagentRuleContext> = {
  id: RULE_ID,
  description: "Subagents include a root subagent.json manifest.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.map(context.files.exists(SUBAGENT_JSON), (present): ReadonlyArray<AdvisoryFinding> => {
      if (present) {
        return [];
      }
      return [
        {
          kind: "advisory",
          ruleId: RULE_ID,
          severity: "error",
          message:
            "subagent.json is missing. Create subagent.json with the required manifest fields (`owner`, `type`, `name`, `version`).",
          location: { file: SUBAGENT_JSON },
        },
      ];
    }),
};
