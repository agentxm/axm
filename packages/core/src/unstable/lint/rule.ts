/**
 * Lint rule and finding primitives.
 *
 * Library-style discriminated unions for the lint engine. Rules are plain
 * values generic over a caller-built `RuleContext` — no Layer wiring, no
 * ambient service bag. Findings are produced by `rule.check`; an
 * `AutofixingRule` also carries a `fix` method that returns per-extension
 * `Operation` values for `axm lint --fix`. Rules that don't apply early-return
 * `[]` from `check`; there is no separate `applies` predicate.
 *
 * Rule `fix` methods compose only from the pre-sync per-extension vocabulary
 * (`install-{type}`, `uninstall-{type}`, `enable-{type}`, `disable-{type}`) so
 * lint-fix rides the same plan pipeline as `axm install`. See
 * `../plan/plan.ts` for the `Operation` primitive.
 *
 * Rule ids follow `<namespace>/<subject>-<predicate>` with lowercase letters,
 * digits, and hyphens; ids leak into settings files, CI logs, and agent
 * transcripts, so they are public API stable under a deprecation-alias policy
 * per the `lint-engine` design doc.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type * as Effect from "effect/Effect";
import type { Operation } from "../plan/plan.js";

// -----------------------------------------------------------------------------
// Severity
// -----------------------------------------------------------------------------

/**
 * Platform-canonical finding severity.
 *
 * WorkspaceMutations `lint.rules` overrides can raise or lower the severity at
 * evaluation time; the catalog pins the platform default.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type Severity = "error" | "warning" | "info";

// -----------------------------------------------------------------------------
// Finding location
// -----------------------------------------------------------------------------

/**
 * Accessor-relative location of a finding.
 *
 * `file` is posix and relative to the rule context's accessor root (skill or
 * pack manifest directory for per-extension rules, workspace root for workspace
 * rules). Rules MUST NOT embed absolute paths, `displayRoot`-qualified paths,
 * or source coordinates in `message`; the display path is composed from
 * `context.displayRoot` and `location.file` at format time via `composePath`.
 *
 * `file: ""` targets the context root itself (e.g., a missing `SKILL.md` on a
 * skill context).
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface FindingLocation {
  readonly file: string;
  readonly line?: number;
  readonly column?: number;
  readonly byteOffset?: number;
  readonly byteLength?: number;
}

// -----------------------------------------------------------------------------
// Finding discriminated union
// -----------------------------------------------------------------------------

/**
 * Fields common to all lint findings.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface FindingBase {
  readonly ruleId: string;
  readonly severity: Severity;
  readonly message: string;
  readonly location?: FindingLocation;
}

/**
 * Finding produced by an `AutofixingRule` that `axm lint --fix` will remediate
 * mechanically.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface AutofixableFinding extends FindingBase {
  readonly kind: "autofixable";
}

/**
 * Finding produced by an `AdvisoryRule` (or by an `AutofixingRule`'s advisory
 * arm when the invariant admits no mechanical resolution).
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface AdvisoryFinding extends FindingBase {
  readonly kind: "advisory";
}

/**
 * Discriminated union of lint findings on `kind`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type LintFinding = AutofixableFinding | AdvisoryFinding;

// -----------------------------------------------------------------------------
// Rule discriminated union
// -----------------------------------------------------------------------------

/**
 * Fields common to all lint rules.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface RuleBase {
  readonly id: string;
  readonly description: string;
  readonly severity: Severity;
}

/**
 * Rule that only surfaces findings; never autofixes.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface AdvisoryRule<C> extends RuleBase {
  readonly kind: "advisory";
  readonly check: (context: C) => Effect.Effect<ReadonlyArray<AdvisoryFinding>>;
}

/**
 * Rule that can emit `AutofixableFinding`s and remediate them via
 * pre-sync per-extension `Operation`s.
 *
 * `check` may return `AdvisoryFinding`s alongside (for sub-cascades that have
 * no single mechanical resolution); `fix` is only invoked for the autofixable
 * arm.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface AutofixingRule<C> extends RuleBase {
  readonly kind: "autofixing";
  readonly check: (context: C) => Effect.Effect<ReadonlyArray<LintFinding>>;
  readonly fix: (
    context: C,
    finding: AutofixableFinding,
  ) => Effect.Effect<ReadonlyArray<Operation<string, unknown>>>;
}

/**
 * Discriminated union of lint rules over a caller-built rule-context type `C`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type LintRule<C> = AdvisoryRule<C> | AutofixingRule<C>;
