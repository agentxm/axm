/**
 * `skill/*` rule catalog.
 *
 * Ordinary lint checks management obligations; the two frontmatter
 * conformance rules run only when explicitly configured:
 *
 * | ID                                     | Severity | Autofix |
 * | -------------------------------------- | -------- | ------- |
 * | `skill/skill-md-present`               | error    | —       |
 * | `skill/manifest-present`               | error    | —       |
 * | `skill/frontmatter-parseable`          | error    | —       |
 * | `skill/frontmatter-standard-valid`      | error    | —       |
 * | `skill/manifest-schema-valid`          | error    | —       |
 * | `skill/manifest-keys-recognized`       | error    | —       |
 * | `skill/standalone-declaration-valid`   | warning  | —       |
 * | `skill/recommended-packs-valid`        | warning  | —       |
 *
 * The `skill.json` rules are the shared manifest envelope (`./skill/envelope.ts`),
 * interleaved with the skill content rules. They apply to native skills only;
 * a non-native skill carries no manifest, so they produce no findings for it.
 *
 * All ship `kind: "advisory"`.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { LintRule } from "../rule.js";
import type { SkillRuleContext } from "../context.js";
import { skillMdPresentRule } from "./skill/skill-md-present.js";
import { skillEnvelopeRules } from "./skill/envelope.js";
import { frontmatterParseableRule } from "./skill/frontmatter-parseable.js";
import { frontmatterStandardValidRule } from "./skill/frontmatter-standard-valid.js";

/**
 * Ordered `skill/*` rule catalog. Declaration order is the evaluation
 * order within a single `evaluateContexts` call (deterministic ordering is
 * test-observable; see `evaluate.ts`).
 *
 * @experimental This API is unstable and may change without notice.
 */
export const skillRules: ReadonlyArray<LintRule<SkillRuleContext>> = [
  skillMdPresentRule,
  skillEnvelopeRules.manifestPresent,
  frontmatterParseableRule,
  frontmatterStandardValidRule,
  skillEnvelopeRules.manifestSchemaValid,
  skillEnvelopeRules.manifestKeysRecognized,
  skillEnvelopeRules.standaloneDeclarationValid,
  skillEnvelopeRules.recommendedPacksValid,
];
