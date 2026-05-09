/**
 * `skill/manifest-present` — native skills must have a `skill.json` at the
 * package root.
 *
 * Reads through `context.packageFiles` (package-root accessor) rather than
 * `context.files` (content-root accessor). For native skills, the package
 * root contains `skill.json` and a `src/` directory holding the skill
 * content; `context.files` is rooted at `src/`, so `skill.json` is only
 * reachable via `packageFiles`.
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
  description: "Native skills include a root skill.json manifest.",
  kind: "advisory",
  severity: "error",
  check: (context) => {
    if (!context.subject.isNative) {
      return Effect.succeed([]);
    }
    return Effect.map(
      context.packageFiles.exists(SKILL_JSON),
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
