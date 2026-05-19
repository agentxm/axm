import * as Effect from "effect/Effect";
import type { ContextFilesRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule } from "../../rule.js";
import { CONTEXT_FILES_JSON } from "./helpers.js";

const RULE_ID = "context-files/manifest-present";

export const manifestPresentRule: AdvisoryRule<ContextFilesRuleContext> = {
  id: RULE_ID,
  description: "Context files packages include a root context-files.json manifest.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.map(
      context.files.exists(CONTEXT_FILES_JSON),
      (present): ReadonlyArray<AdvisoryFinding> => {
        if (present) {
          return [];
        }
        return [
          {
            kind: "advisory",
            ruleId: RULE_ID,
            severity: "error",
            message:
              "context-files.json is missing. Create context-files.json with the required manifest fields (`owner`, `type`, `name`, `version`, `contents`).",
            location: { file: CONTEXT_FILES_JSON },
          },
        ];
      },
    ),
};
