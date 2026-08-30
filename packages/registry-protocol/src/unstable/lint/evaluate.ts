/**
 * Pure evaluator for the lint engine.
 *
 * `evaluateContexts(rules, contexts, config)` pairs each rule with each context,
 * invokes `rule.check`, applies permitted severity overrides from
 * `config.rules`, and drops warning findings configured `"off"`.
 *
 * Both functions are plain `Effect` values; neither requires a Layer or an
 * ambient service. See the `lint-engine` design doc §3 for the rationale
 * behind library primitives over a central engine service.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import type { LintConfig, LintRuleSeverity } from "./config.js";
import type { LintFinding, LintRule, Severity } from "./rule.js";

// -----------------------------------------------------------------------------
// Evaluated — the (rule, context, findings) triple
// -----------------------------------------------------------------------------

/**
 * One `(rule, context, findings)` evaluation result.
 *
 * `findings` is emitted after severity overrides from `config.rules` have been
 * applied; rule-level severity is the platform default, finding-level severity
 * is the effective post-override severity.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface Evaluated<C> {
  readonly rule: LintRule<C>;
  readonly context: C;
  readonly findings: ReadonlyArray<LintFinding>;
}

// -----------------------------------------------------------------------------
// Severity override
// -----------------------------------------------------------------------------

/**
 * Translate a `LintRuleSeverity` config value into an effective `Severity`
 * or the `"off"` sentinel. `"warn"` maps to `"warning"` so downstream code
 * sees the canonical three-severity alphabet.
 *
 * `config.rules` keys are exact rule ids with no wildcard / glob support in v1;
 * see `./config.ts` for the schema.
 */
const translateConfigValue = (value: LintRuleSeverity): Severity | "off" => {
  switch (value) {
    case "warn":
      return "warning";
    case "off":
    case "info":
    case "error":
      return value;
  }
};

const applyOverride = (
  defaultSeverity: Severity,
  override: LintRuleSeverity | undefined,
): Severity | "off" => {
  if (defaultSeverity === "error") {
    return "error";
  }
  if (override === undefined) {
    return defaultSeverity;
  }
  const translated = translateConfigValue(override);
  return defaultSeverity === "warning" && translated === "info" ? "warning" : translated;
};

const withSeverity = (finding: LintFinding, severity: Severity): LintFinding => ({
  ...finding,
  severity,
});

// -----------------------------------------------------------------------------
// evaluateContexts
// -----------------------------------------------------------------------------

/**
 * Pair each rule with each context, run `rule.check`, apply severity overrides
 * from `config.rules`, and return one `Evaluated<C>` per pair.
 *
 * Findings whose configured severity is `"off"` are suppressed entirely; the
 * `Evaluated` entry still ships (with an empty `findings` array) so consumers
 * that group by rule still see the rule ran.
 *
 * Rules are evaluated in catalog order; contexts are evaluated in caller
 * order. Rule-context invocation is sequential within a single
 * `evaluateContexts` call so tests can observe deterministic ordering.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const evaluateContexts = <C>(
  rules: ReadonlyArray<LintRule<C>>,
  contexts: ReadonlyArray<C>,
  config: LintConfig,
): Effect.Effect<ReadonlyArray<Evaluated<C>>> =>
  Effect.forEach(
    rules.flatMap((rule) => contexts.map((context) => ({ rule, context }))),
    ({ rule, context }) => evaluateOne(rule, context, config),
    { concurrency: 1 },
  );

const evaluateOne = <C>(
  rule: LintRule<C>,
  context: C,
  config: LintConfig,
): Effect.Effect<Evaluated<C>> =>
  Effect.map(rule.check(context), (rawFindings) => ({
    rule,
    context,
    findings: applySeverityConfig(rule, rawFindings, config),
  }));

const applySeverityConfig = <C>(
  rule: LintRule<C>,
  findings: ReadonlyArray<LintFinding>,
  config: LintConfig,
): ReadonlyArray<LintFinding> => {
  const override = config.rules?.[rule.id];
  const effective = applyOverride(rule.severity, override);
  if (effective === "off") {
    return [];
  }
  return findings.map((finding) => withSeverity(finding, effective));
};
