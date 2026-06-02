import * as Effect from "effect/Effect";
import type { FilesRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule } from "../../rule.js";
import { FILES_JSON } from "./helpers.js";

const RULE_ID = "files/manifest-present";

export const manifestPresentRule: AdvisoryRule<FilesRuleContext> = {
  id: RULE_ID,
  description: "files packages include a root files.json manifest.",
  kind: "advisory",
  severity: "error",
  check: (files) =>
    Effect.map(files.files.exists(FILES_JSON), (present): ReadonlyArray<AdvisoryFinding> => {
      if (present) {
        return [];
      }
      return [
        {
          kind: "advisory",
          ruleId: RULE_ID,
          severity: "error",
          message:
            "files.json is missing. Create files.json with the required manifest fields (`owner`, `type`, `name`, `version`, `contents`).",
          location: { file: FILES_JSON },
        },
      ];
    }),
};
