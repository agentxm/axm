import * as Effect from "effect/Effect";
import { HOOK_MANIFEST_FILENAME } from "../../../hooks/manifest-schema.js";
import type { HookRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule } from "../../rule.js";

const RULE_ID = "hook/manifest-present";

export const manifestPresentRule: AdvisoryRule<HookRuleContext> = {
  id: RULE_ID,
  description: "Hooks include a root hook.json manifest.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.map(
      context.files.exists(HOOK_MANIFEST_FILENAME),
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
              "hook.json is missing. Create hook.json with the required manifest fields (`owner`, `type`, `name`, `version`, `runtime`, `entrypoint`, `bindings`).",
            location: { file: HOOK_MANIFEST_FILENAME },
          },
        ];
      },
    ),
};
