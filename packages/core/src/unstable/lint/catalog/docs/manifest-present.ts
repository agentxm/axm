import * as Effect from "effect/Effect";
import type { DocsRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule } from "../../rule.js";
import { DOCS_JSON } from "./helpers.js";

const RULE_ID = "docs/manifest-present";

export const manifestPresentRule: AdvisoryRule<DocsRuleContext> = {
  id: RULE_ID,
  description: "docs packages include a root docs.json manifest.",
  kind: "advisory",
  severity: "error",
  check: (docs) =>
    Effect.map(docs.files.exists(DOCS_JSON), (present): ReadonlyArray<AdvisoryFinding> => {
      if (present) {
        return [];
      }
      return [
        {
          kind: "advisory",
          ruleId: RULE_ID,
          severity: "error",
          message:
            "docs.json is missing. Create docs.json with the required manifest fields (`owner`, `type`, `name`, `version`, `contents`).",
          location: { file: DOCS_JSON },
        },
      ];
    }),
};
