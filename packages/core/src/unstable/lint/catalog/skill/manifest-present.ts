/**
 * `skill/manifest-present` — native skills must have a `skill.json` at the
 * skill root.
 *
 * Native-only via `check` early-return: when `subject.isNative === false`
 * (managed-external skills without a declared manifest), the rule produces
 * no findings. No separate `applies` predicate per
 * `docs/design/lint-engine.md §3`.
 *
 * Advisory-only — scaffolding a manifest is a user-authored action.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import type { SkillRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule } from "../../rule.js";

const RULE_ID = "skill/manifest-present";
const SKILL_JSON = "skill.json";

export const manifestPresentRule: AdvisoryRule<SkillRuleContext> = {
  id: RULE_ID,
  description: "Native skill has a skill.json manifest at its root.",
  kind: "advisory",
  severity: "error",
  check: (context) => {
    if (!context.subject.isNative) {
      return Effect.succeed([]);
    }
    return Effect.map(
      context.files.exists(SKILL_JSON),
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
              "skill.json is missing for this native skill. Create skill.json with the required manifest fields (`owner`, `type`, `name`, `version`).",
            location: { file: SKILL_JSON },
          },
        ];
      },
    );
  },
};
