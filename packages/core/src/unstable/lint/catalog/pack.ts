/**
 * `pack/*` rule catalog — the v1 three-rule set.
 *
 * Per the lint design, registry publish and `axm lint`
 * run exactly these rules against each pack context:
 *
 * | ID                              | Severity | Autofix |
 * | ------------------------------- | -------- | ------- |
 * | `pack/manifest-present`         | error    | —       |
 * | `pack/manifest-schema-valid`    | error    | —       |
 * | `pack/manifest-keys-recognized` | error    | —       |
 *
 * All three ship `kind: "advisory"`. Packs are registry-only at v1 (no
 * non-native arm), so there is no applicability discriminator — every pack
 * context runs every rule and the `check` body's early-return arms handle
 * manifest-absent cases.
 *
 * Rule ids are **registered with the lint config allowlist at module-load
 * time**, so importing this catalog extends the set of accepted
 * `axm.json` `lint.rules` keys. Consumers that never import the
 * catalog (the registry Worker bundle for `skill`-only routes, e.g.) don't
 * pay the registration cost.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import { registerLintRuleIds } from "../config.js";
import type { LintRule } from "../rule.js";
import type { PackRuleContext } from "../context.js";
import { manifestPresentRule } from "./pack/manifest-present.js";
import { manifestSchemaValidRule } from "./pack/manifest-schema-valid.js";
import { manifestKeysRecognizedRule } from "./pack/manifest-keys-recognized.js";

/**
 * Ordered v1 `pack/*` rule catalog. Declaration order is the evaluation
 * order within a single `evaluateContexts` call (deterministic ordering is
 * test-observable; see `evaluate.ts`).
 *
 * @experimental This API is unstable and may change without notice.
 */
export const packRules: ReadonlyArray<LintRule<PackRuleContext>> = [
  manifestPresentRule,
  manifestSchemaValidRule,
  manifestKeysRecognizedRule,
];

// Register ids into the `LintConfig.rules` allowlist. Module-load side effect:
// a consumer that imports this catalog (or the `catalog/index` barrel) enables
// `axm.json` `lint.rules` to reference any of the above rule ids.
registerLintRuleIds(packRules.map((r) => r.id));
