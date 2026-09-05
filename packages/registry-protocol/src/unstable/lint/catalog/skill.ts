/**
 * `skill/*` rule catalog.
 *
 * Per the lint design, registry publish and `axm lint`
 * run exactly these rules against each skill context:
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
 * The last two come from `catalog/shared/recommended-packs-rules.ts`; every
 * non-pack catalog applies the same pair against its own manifest.
 *
 * All ship `kind: "advisory"`. Native-vs-non-native applicability is
 * expressed via `check` early-return (no separate `applies` predicate); see
 * each rule's module for the guard.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { LintRule } from "../rule.js";
import type { SkillRuleContext } from "../context.js";
import { skillMdPresentRule } from "./skill/skill-md-present.js";
import { manifestPresentRule } from "./skill/manifest-present.js";
import { frontmatterParseableRule } from "./skill/frontmatter-parseable.js";
import { frontmatterStandardValidRule } from "./skill/frontmatter-standard-valid.js";
import { manifestSchemaValidRule } from "./skill/manifest-schema-valid.js";
import { manifestKeysRecognizedRule } from "./skill/manifest-keys-recognized.js";
import { recommendedPacksValidRule } from "./skill/recommended-packs-valid.js";
import { standaloneDeclarationValidRule } from "./skill/standalone-declaration-valid.js";

/**
 * Ordered v1 `skill/*` rule catalog. Declaration order is the evaluation
 * order within a single `evaluateContexts` call (deterministic ordering is
 * test-observable; see `evaluate.ts`).
 *
 * @experimental This API is unstable and may change without notice.
 */
export const skillRules: ReadonlyArray<LintRule<SkillRuleContext>> = [
  skillMdPresentRule,
  manifestPresentRule,
  frontmatterParseableRule,
  frontmatterStandardValidRule,
  manifestSchemaValidRule,
  manifestKeysRecognizedRule,
  standaloneDeclarationValidRule,
  recommendedPacksValidRule,
];
