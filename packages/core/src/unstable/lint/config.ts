/**
 * `LintConfig` — workspace-settings-level lint configuration.
 *
 * WorkspaceMutations `.axm/settings.json` carries a `lint` section whose `rules` map
 * binds rule ids to `"off" | "info" | "warn" | "error"`. The registry publish
 * gate ignores workspace overrides; this config affects `axm lint` only.
 *
 * Keys are **exact** rule ids (`<namespace>/<name>`). No glob, wildcard, or
 * regex syntax is accepted in v1. The accepted-key set is built at schema
 * construction time from rule ids registered via `registerLintRuleIds` — the
 * three v1 catalogs (`skill/*`, `pack/*`, `workspace/*`) each register their
 * ids so adding a catalog in a later phase extends the set by construction.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Schema from "effect/Schema";

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

// -----------------------------------------------------------------------------
// Registered rule-id allowlist
// -----------------------------------------------------------------------------

/**
 * Internal mutable registry of accepted rule ids, populated at module-load
 * time by each rule catalog's side-effecting `registerLintRuleIds` call.
 *
 * The registry is module-local so callers in other packages can't extend it
 * without going through `registerLintRuleIds`; the v1 catalogs register from
 * `./catalog/skill.ts`, `./catalog/pack.ts`, and `./catalog/workspace.ts` in
 * Phases 3a/3b/3c.
 */
const registeredRuleIds = new Set<string>();

/**
 * Register one or more rule ids into the config allowlist.
 *
 * Each v1 rule catalog calls this once at module-load to extend the set of
 * accepted `lint.rules` keys. Calls are additive and idempotent — registering
 * an id twice is a no-op. A rule id that isn't registered will cause
 * `SettingsSchema` decode to fail at the `lint.rules` key, surfacing the
 * unknown id in the error path.
 *
 * Consumers (Phases 3a/3b/3c) should register from the catalog module by
 * iterating the catalog's own rule array: no copy-paste of rule ids into this
 * file.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const registerLintRuleIds = (ids: Iterable<string>): void => {
  for (const id of ids) {
    registeredRuleIds.add(id);
  }
};

/**
 * Read-only view of the currently-registered rule ids.
 *
 * Mainly useful for tests and snapshots; production callers should not depend
 * on ordering.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const registeredLintRuleIds = (): ReadonlySet<string> => registeredRuleIds;

// -----------------------------------------------------------------------------
// Rules map schema
// -----------------------------------------------------------------------------

const ruleIdKeyFilter = Schema.makeFilter(
  (input: Readonly<Record<string, unknown>>): string | undefined => {
    const invalid: Array<string> = [];
    for (const key of Object.keys(input)) {
      if (!registeredRuleIds.has(key)) {
        invalid.push(key);
      }
    }
    if (invalid.length === 0) {
      return undefined;
    }
    return `Unknown lint rule id(s) in lint.rules: ${invalid.join(", ")}. Keys must be exact <namespace>/<name> ids; wildcards and globs are not supported.`;
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
 * `lint` section of `.axm/settings.json`.
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
  description: "Lint configuration under `lint` in `.axm/settings.json`.",
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
