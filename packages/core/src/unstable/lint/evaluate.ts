/**
 * Pure evaluator for the lint engine.
 *
 * `evaluateContexts(rules, contexts, config)` pairs each rule with each context,
 * invokes `rule.check`, applies severity overrides from `config.rules`, and
 * drops findings whose configured severity is `"off"`. It never invokes
 * `rule.fix` — that is the caller's job via `collectFixOperations` plus the
 * plan pipeline.
 *
 * `collectFixOperations(evaluated)` walks the `AutofixableFinding`s produced
 * above, invokes the matched rule's `fix`, flattens the returned operations
 * and deduplicates them by structural equality. Two rules that emit the same
 * `install-skill` Operation for the same target contribute it once.
 *
 * Both functions are plain `Effect` values; neither requires a Layer or an
 * ambient service. See the `lint-engine` design doc §3 for the rationale
 * behind library primitives over a central engine service.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import type { Operation } from "../plan/plan.js";
import type { LintConfig, LintRuleSeverity } from "./config.js";
import type {
  AdvisoryFinding,
  AutofixableFinding,
  AutofixingRule,
  LintFinding,
  LintRule,
  Severity,
} from "./rule.js";

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
  if (override === undefined) {
    return defaultSeverity;
  }
  return translateConfigValue(override);
};

const withSeverity = (finding: LintFinding, severity: Severity): LintFinding => {
  if (finding.kind === "autofixable") {
    const next: AutofixableFinding = { ...finding, severity };
    return next;
  }
  const next: AdvisoryFinding = { ...finding, severity };
  return next;
};

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
  return Array.map(findings, (finding) => withSeverity(finding, effective));
};

// -----------------------------------------------------------------------------
// collectFixOperations
// -----------------------------------------------------------------------------

/**
 * Walk the `AutofixableFinding`s in `evaluated`, invoke each matched rule's
 * `fix`, flatten the returned operations, and deduplicate by structural
 * equality of the Operation value.
 *
 * Structural equality is defined as JSON-serializable deep equality on
 * `{ name, args }`. v1 operations are plain POJOs; if an operation later grows
 * non-serializable fields, the dedupe key extraction lands alongside that
 * change.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const collectFixOperations = <C>(
  evaluated: ReadonlyArray<Evaluated<C>>,
): Effect.Effect<ReadonlyArray<Operation<string, unknown>>> =>
  Effect.gen(function* () {
    const collected: Array<Operation<string, unknown>> = [];
    const seen = new Set<string>();

    for (const entry of evaluated) {
      if (entry.rule.kind !== "autofixing") {
        continue;
      }
      const rule: AutofixingRule<C> = entry.rule;

      for (const finding of entry.findings) {
        if (finding.kind !== "autofixable") {
          continue;
        }
        const ops = yield* rule.fix(entry.context, finding);
        for (const op of ops) {
          const key = dedupeKey(op);
          if (seen.has(key)) {
            continue;
          }
          seen.add(key);
          collected.push(op);
        }
      }
    }

    return collected;
  });

const dedupeKey = (op: Operation<string, unknown>): string => {
  // Stable serialization: sort keys recursively to avoid collisions from
  // property-order differences. v1 Operation args are plain JSON-compatible
  // values; when that stops being true, dedupe extraction changes alongside.
  return JSON.stringify(op, canonicalReplacer);
};

const canonicalReplacer = (_key: string, value: unknown): unknown => {
  if (!isPlainRecord(value)) {
    return value;
  }
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(value).sort()) {
    sorted[k] = value[k];
  }
  return sorted;
};

const isPlainRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
