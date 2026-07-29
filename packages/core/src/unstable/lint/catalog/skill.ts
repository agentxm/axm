/**
 * `skill/*` rule catalog.
 *
 * Per `agentxm-internal/docs/design/lint-engine.md §10.skill`, registry publish and `axm lint`
 * run exactly these rules against each skill context:
 *
 * | ID                                     | Severity | Autofix |
 * | -------------------------------------- | -------- | ------- |
 * | `skill/skill-md-present`               | error    | —       |
 * | `skill/manifest-present`               | error    | —       |
 * | `skill/frontmatter-parseable`          | error    | —       |
 * | `skill/manifest-schema-valid`          | error    | —       |
 * | `skill/manifest-keys-recognized`       | error    | —       |
 * | `skill/capability-targeting-*`         | warning  | —       |
 * | `skill/standalone-declaration-valid`   | warning  | —       |
 * | `skill/recommended-packs-valid`        | warning  | —       |
 *
 * The last two come from `catalog/shared/recommended-packs-rules.ts`; every
 * non-pack catalog registers the same pair against its own manifest.
 *
 * All ship `kind: "advisory"`. Native-vs-non-native applicability is
 * expressed via `check` early-return (no separate `applies` predicate); see
 * each rule's module for the guard.
 *
 * Rule ids are **registered with the lint config allowlist at module-load
 * time**, so importing this catalog extends the set of accepted
 * `.axm/settings.json` `lint.rules` keys. Consumers that never import the
 * catalog (the registry Worker bundle for `pack`-only routes, e.g.) don't pay
 * the registration cost.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import { registerLintRuleIds } from "../config.js";
import type { LintRule } from "../rule.js";
import type { SkillRuleContext } from "../context.js";
import { skillMdPresentRule } from "./skill/skill-md-present.js";
import { manifestPresentRule } from "./skill/manifest-present.js";
import { frontmatterParseableRule } from "./skill/frontmatter-parseable.js";
import { manifestSchemaValidRule } from "./skill/manifest-schema-valid.js";
import { manifestKeysRecognizedRule } from "./skill/manifest-keys-recognized.js";
import { capabilityTargetingMetadataRule } from "./skill/capability-targeting-metadata.js";
import { capabilityTargetingStructuralRule } from "./skill/capability-targeting-structural.js";
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
  manifestSchemaValidRule,
  manifestKeysRecognizedRule,
  capabilityTargetingStructuralRule,
  capabilityTargetingMetadataRule,
  standaloneDeclarationValidRule,
  recommendedPacksValidRule,
];

// Register ids into the `LintConfig.rules` allowlist. Module-load side effect:
// a consumer that imports this catalog (or the `catalog/index` barrel) enables
// `.axm/settings.json` `lint.rules` to reference any of the above rule ids.
registerLintRuleIds(skillRules.map((r) => r.id));
