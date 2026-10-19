/**
 * `pack/*` rule catalog.
 *
 * Registry publish and `axm lint` run exactly these rules against each pack
 * context:
 *
 * | ID                              | Severity | Autofix |
 * | ------------------------------- | -------- | ------- |
 * | `pack/manifest-present`         | error    | —       |
 * | `pack/manifest-schema-valid`    | error    | —       |
 * | `pack/manifest-keys-recognized` | error    | —       |
 *
 * They are the first three rules of the shared manifest envelope
 * (`./pack/envelope.ts`). Packs carry no `standalone` or `recommendedPacks`
 * fields, so the envelope's two pack-membership rules do not apply.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { LintRule } from "../rule.js";
import type { ManifestRuleContext, PackContent } from "../context.js";
import { packEnvelopeRules } from "./pack/envelope.js";

/**
 * Ordered `pack/*` rule catalog. Declaration order is the evaluation
 * order within a single `evaluateContexts` call (deterministic ordering is
 * test-observable; see `evaluate.ts`).
 *
 * @experimental This API is unstable and may change without notice.
 */
export const packRules: ReadonlyArray<LintRule<ManifestRuleContext<PackContent>>> = [
  packEnvelopeRules.manifestPresent,
  packEnvelopeRules.manifestSchemaValid,
  packEnvelopeRules.manifestKeysRecognized,
];
