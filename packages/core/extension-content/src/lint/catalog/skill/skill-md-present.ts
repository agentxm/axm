/**
 * `skill/skill-md-present` — every skill must have a `SKILL.md` at its root.
 *
 * Applies to every skill context (native and non-native). Upstream-required
 * by the agentskills specification; also the precondition for the
 * `skill/frontmatter-parseable` cascade.
 *
 * Advisory-only (no autofix). Scaffolding `SKILL.md` requires user-authored
 * content and is not a meaning-preserving normalization.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import type { SkillRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule } from "../../rule.js";

const RULE_ID = "skill/skill-md-present";
const SKILL_MD = "SKILL.md";

export const skillMdPresentRule: AdvisoryRule<SkillRuleContext> = {
  id: RULE_ID,
  description: "Skills include a root SKILL.md file.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.map(context.files.exists(SKILL_MD), (present): ReadonlyArray<AdvisoryFinding> => {
      if (present) {
        return [];
      }
      return [
        {
          kind: "advisory",
          ruleId: RULE_ID,
          severity: "error",
          message:
            "SKILL.md is missing. Create SKILL.md with the required frontmatter (`name`, `description`).",
          location: { file: SKILL_MD },
        },
      ];
    }),
};
