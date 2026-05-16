import * as Effect from "effect/Effect";
import type { CommandRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule } from "../../rule.js";

const RULE_ID = "command/manifest-present";
const COMMAND_JSON = "command.json";

export const manifestPresentRule: AdvisoryRule<CommandRuleContext> = {
  id: RULE_ID,
  description: "Commands include a root command.json manifest.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.map(context.files.exists(COMMAND_JSON), (present): ReadonlyArray<AdvisoryFinding> => {
      if (present) {
        return [];
      }
      return [
        {
          kind: "advisory",
          ruleId: RULE_ID,
          severity: "error",
          message:
            "command.json is missing. Create command.json with the required manifest fields (`owner`, `type`, `name`, `version`).",
          location: { file: COMMAND_JSON },
        },
      ];
    }),
};
