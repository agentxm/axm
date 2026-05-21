import * as Effect from "effect/Effect";
import type { ContextRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule } from "../../rule.js";
import { CONTEXT_JSON } from "./helpers.js";

const RULE_ID = "context/manifest-present";

export const manifestPresentRule: AdvisoryRule<ContextRuleContext> = {
  id: RULE_ID,
  description: "context packages include a root context.json manifest.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.map(context.files.exists(CONTEXT_JSON), (present): ReadonlyArray<AdvisoryFinding> => {
      if (present) {
        return [];
      }
      return [
        {
          kind: "advisory",
          ruleId: RULE_ID,
          severity: "error",
          message:
            "context.json is missing. Create context.json with the required manifest fields (`owner`, `type`, `name`, `version`, `contents`).",
          location: { file: CONTEXT_JSON },
        },
      ];
    }),
};
