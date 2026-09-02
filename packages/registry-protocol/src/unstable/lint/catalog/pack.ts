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
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

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
