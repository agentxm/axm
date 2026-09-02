/**
 * `LintConfig` — workspace-settings-level lint configuration.
 *
 * Workspace settings carry a `lint` section whose `rules` map binds rule ids
 * to `"off" | "info" | "warn" | "error"`. The registry publish
 * gate ignores workspace overrides; this config affects `axm lint` only.
 *
 * Keys are **exact** rule ids (`<namespace>/<name>`). No glob, wildcard, or
 * regex syntax is accepted. The accepted-key set comes from the static lint
 * catalog metadata, so validation never depends on which executable catalog
 * modules happened to be imported first.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Schema from "effect/Schema";
import { allLintCatalogRuleIds } from "./catalog-metadata.js";

// -----------------------------------------------------------------------------
// Config value schema
// -----------------------------------------------------------------------------

/**
 * Accepted values for a `lint.rules` entry.
 *
 * Note: `"warn"` is the config surface for `Severity` `"warning"`; mirror's
 * ESLint convention. The evaluator treats `"warn"` as equivalent to `warning`
 * severity; `"off"` suppresses emission.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const LintRuleSeveritySchema = Schema.Literals(["off", "info", "warn", "error"]).annotate({
  identifier: "LintRuleSeverity",
  title: "Lint Rule Severity",
  description:
    "Severity override for a lint rule: 'off' silences it, 'info'/'warn'/'error' raise or lower severity.",
});

/**
 * Effective severity of a `lint.rules` entry.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type LintRuleSeverity = Schema.Schema.Type<typeof LintRuleSeveritySchema>;

const acceptedRuleIds = new Set(allLintCatalogRuleIds);

// -----------------------------------------------------------------------------
// Rules map schema
// -----------------------------------------------------------------------------

const ruleIdKeyFilter = Schema.makeFilter(
  (input: Readonly<Record<string, unknown>>): string | undefined => {
    const invalid: Array<string> = [];
    for (const key of Object.keys(input)) {
      if (!acceptedRuleIds.has(key)) {
        invalid.push(key);
      }
    }
    if (invalid.length === 0) {
      return undefined;
    }
    return `Unknown lint rule IDs in lint.rules: ${invalid.join(", ")}. Keys must be exact <namespace>/<name> IDs; wildcards and globs are not supported.`;
  },
);

/**
 * Record of `<namespace>/<name>` ids to severity overrides.
 *
 * Unknown / wildcard / regex keys are rejected at decode by the filter — the
 * filter walks the decoded record's keys and checks every key against the
 * registered rule-id set. Wildcard patterns like `"skill/*"` fail the filter
 * because they are not registered ids.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const LintRulesMapSchema = Schema.Record(Schema.String, LintRuleSeveritySchema)
  .annotate({
    identifier: "LintRulesMap",
    title: "Lint Rules Map",
    description: "Map of exact <namespace>/<name> rule ids to severity overrides for `axm lint`.",
  })
  .check(ruleIdKeyFilter);

/**
 * Inferred type for `LintRulesMap`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type LintRulesMap = Schema.Schema.Type<typeof LintRulesMapSchema>;

// -----------------------------------------------------------------------------
// LintConfig schema
// -----------------------------------------------------------------------------

/**
 * `lint` section of `axm.json`.
 *
 * Today only `rules` is defined; future fields (per-rule options, reporter
 * selection) extend this struct. The schema rejects excess top-level keys so
 * typos surface at decode.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const LintConfigSchema = Schema.Struct({
  rules: Schema.optionalKey(
    LintRulesMapSchema.annotate({
      description: "Exact lint rule ids mapped to severity overrides.",
      examples: [{ "workspace/settings-schema-valid": "error" }],
    }),
  ),
}).annotate({
  identifier: "LintConfig",
  title: "Lint Config",
  description: "Lint configuration under `lint` in workspace settings.",
});

/**
 * Inferred type for `LintConfig`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type LintConfig = Schema.Schema.Type<typeof LintConfigSchema>;

/**
 * The platform-canonical `LintConfig` — empty rules, no overrides.
 *
 * Registry publish uses this config; it carries no overrides so every rule
 * fires at its catalog severity.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const platformCanonicalLintConfig: LintConfig = { rules: {} };
