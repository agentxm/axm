/**
 * Lint runner — the reusable core of `axm lint`.
 *
 * The `axm lint` CLI command file is a thin surface over flag parsing and
 * rendering; the logic that evaluates rule catalogs, renders findings, detects
 * publish-gate drift, and (under `--fix`) composes the autofix plan lives in
 * this module.
 *
 * Phase 5 entry points (see `openspec/changes/add-lint-engine/tasks.md`):
 *
 * - {@link evaluateAllCatalogs}         — concurrent evaluation of the three
 *   v1 rule catalogs against pre-built contexts.
 * - {@link summarizeEvaluations}        — group, count, and derive the exit
 *   category from raw `Evaluated<*>` lists.
 * - {@link detectPublishGateDrift}      — compute whether the configured
 *   `LintConfig` weakens any `skill/*` / `pack/*` platform-default-`error`
 *   rule (task 5.7).
 * - {@link renderFindingsText}          — finding-first human renderer (task
 *   5.6).
 * - {@link toLintJsonDocument}          — `--json` document shape (task 5.6).
 * - {@link resolveLintExitCategory}     — exit-code contract evaluator (task
 *   5.9).
 *
 * Lint-intent → canonical `Operation` adapter composition happens in the CLI
 * handler (`packages/cli/src/root/lint/handler.ts`), which re-resolves each
 * intent's `source` via the `resolveConfigured*` helpers and hands the
 * resulting canonical Operation to the per-extension plan-step builder. The
 * runner here stays accessor-free.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import { composePath } from "./compose-path.js";
import type { LintConfig } from "./config.js";
import { platformCanonicalLintConfig } from "./config.js";
import type { Evaluated } from "./evaluate.js";
import { evaluateContexts } from "./evaluate.js";
import type { PackRuleContext, SkillRuleContext, WorkspaceRuleContext } from "./context.js";
import type { AutofixingRule, LintFinding, Severity } from "./rule.js";
import { packRules, skillRules, workspaceRules } from "./catalog/index.js";

// -----------------------------------------------------------------------------
// Grouping + summary
// -----------------------------------------------------------------------------

/**
 * A single finding annotated with the context that produced it.
 *
 * `displayRoot` carries the context's rendering root; `path` is the
 * pre-composed display path for the finding so consumers (text / JSON /
 * summary logs) don't re-derive it.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface RenderedFinding {
  readonly group: "skill" | "pack" | "workspace";
  readonly displayRoot: string;
  readonly path: string;
  readonly finding: LintFinding;
}

/**
 * Per-group evaluation result. The raw `Evaluated<*>` list is retained so
 * downstream consumers (render, JSON emitter, `collectFixOperations`) can
 * walk evaluations without re-running rules.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface GroupEvaluations {
  readonly skills: ReadonlyArray<Evaluated<SkillRuleContext>>;
  readonly packs: ReadonlyArray<Evaluated<PackRuleContext>>;
  readonly workspace: ReadonlyArray<Evaluated<WorkspaceRuleContext>>;
}

/**
 * Aggregate counts across all emitted findings.
 *
 * `total` === `errors + warnings + infos` — info findings participate in
 * rendering and in the JSON envelope, but never influence exit code.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface FindingCounts {
  readonly total: number;
  readonly errors: number;
  readonly warnings: number;
  readonly infos: number;
}

/**
 * Possible exit-code categories for `axm lint`.
 *
 * - `"clean"` — zero findings, or only info-severity findings; zero exit.
 * - `"warnings"` — at least one warning, no errors; non-zero only when
 *   `--strict` is set (see {@link resolveLintExitCategory}).
 * - `"errors"` — at least one error; non-zero exit regardless of flags.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type LintExitCategory = "clean" | "warnings" | "errors";

// -----------------------------------------------------------------------------
// Evaluation
// -----------------------------------------------------------------------------

/**
 * Build the three v1 evaluation groups concurrently.
 *
 * The evaluator is a pure `Effect.Effect<ReadonlyArray<Evaluated<C>>>`; this
 * helper simply hands the three catalogs to `Effect.all` with unbounded
 * concurrency so catalog evaluations run in parallel but findings stay in
 * stable catalog order inside each group.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const evaluateAllCatalogs = (args: {
  readonly skillContexts: ReadonlyArray<SkillRuleContext>;
  readonly packContexts: ReadonlyArray<PackRuleContext>;
  readonly workspaceContext: WorkspaceRuleContext;
  readonly config: LintConfig;
}): Effect.Effect<GroupEvaluations> =>
  Effect.gen(function* () {
    const [skills, packs, workspace] = yield* Effect.all(
      [
        evaluateContexts(skillRules, args.skillContexts, args.config),
        evaluateContexts(packRules, args.packContexts, args.config),
        evaluateContexts(workspaceRules, [args.workspaceContext], args.config),
      ],
      { concurrency: "unbounded" },
    );
    return { skills, packs, workspace };
  });

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------

const severityOrder = (s: Severity): number => {
  switch (s) {
    case "error":
      return 0;
    case "warning":
      return 1;
    case "info":
      return 2;
  }
};

const flattenEvaluated = <C>(
  group: "skill" | "pack" | "workspace",
  evaluated: ReadonlyArray<Evaluated<C>>,
  getDisplayRoot: (c: C) => string,
): ReadonlyArray<RenderedFinding> => {
  const out: Array<RenderedFinding> = [];
  for (const entry of evaluated) {
    const displayRoot = getDisplayRoot(entry.context);
    for (const finding of entry.findings) {
      out.push({
        group,
        displayRoot,
        path: composePath(displayRoot, finding.location),
        finding,
      });
    }
  }
  return out;
};

/**
 * Flatten a {@link GroupEvaluations} triple into a single `RenderedFinding[]`
 * in stable group-then-catalog order.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const collectRenderedFindings = (
  evaluations: GroupEvaluations,
): ReadonlyArray<RenderedFinding> => [
  ...flattenEvaluated("skill", evaluations.skills, (c) => c.displayRoot),
  ...flattenEvaluated("pack", evaluations.packs, (c) => c.displayRoot),
  ...flattenEvaluated("workspace", evaluations.workspace, (c) => c.displayRoot),
];

/**
 * Count findings by severity across every group.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const countFindings = (findings: ReadonlyArray<RenderedFinding>): FindingCounts => {
  let errors = 0;
  let warnings = 0;
  let infos = 0;
  for (const f of findings) {
    switch (f.finding.severity) {
      case "error":
        errors += 1;
        break;
      case "warning":
        warnings += 1;
        break;
      case "info":
        infos += 1;
        break;
    }
  }
  return { total: findings.length, errors, warnings, infos };
};

/**
 * Aggregated summary — counts + derived exit category — computed from a
 * {@link GroupEvaluations} triple.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface LintSummary {
  readonly findings: ReadonlyArray<RenderedFinding>;
  readonly counts: FindingCounts;
  readonly exitCategory: LintExitCategory;
  readonly driftBanner: ReadonlyArray<string>;
}

/**
 * Derive a full {@link LintSummary} (findings, counts, exit category, drift
 * banner rule ids) from raw evaluations + the configured severity overrides.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const summarizeEvaluations = (
  evaluations: GroupEvaluations,
  config: LintConfig,
): LintSummary => {
  const findings = collectRenderedFindings(evaluations);
  const counts = countFindings(findings);
  return {
    findings,
    counts,
    exitCategory: exitCategoryFromCounts(counts),
    driftBanner: detectPublishGateDrift(config),
  };
};

const exitCategoryFromCounts = (counts: FindingCounts): LintExitCategory => {
  if (counts.errors > 0) {
    return "errors";
  }
  if (counts.warnings > 0) {
    return "warnings";
  }
  return "clean";
};

// -----------------------------------------------------------------------------
// Exit-code contract (task 5.9)
// -----------------------------------------------------------------------------

/**
 * Translate a {@link LintExitCategory} + `--strict` into the exit-code
 * policy.
 *
 * | Category     | --strict=false | --strict=true |
 * | ------------ | -------------- | ------------- |
 * | `"clean"`    | `0`            | `0`           |
 * | `"warnings"` | `0`            | non-zero      |
 * | `"errors"`   | non-zero       | non-zero      |
 *
 * The return value is a discriminated enum; the CLI handler maps the `"fail"`
 * branch to its platform exit-code primitive.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const resolveLintExitCategory = (args: {
  readonly category: LintExitCategory;
  readonly strict: boolean;
}): "success" | "fail" => {
  switch (args.category) {
    case "errors":
      return "fail";
    case "warnings":
      return args.strict ? "fail" : "success";
    case "clean":
      return "success";
  }
};

// -----------------------------------------------------------------------------
// Drift banner (task 5.7)
// -----------------------------------------------------------------------------

/**
 * Identify every configured `lint.rules` entry that weakens a platform-canonical
 * `error`-severity `skill/*` or `pack/*` rule.
 *
 * The publish gate runs the `skill/*` and `pack/*` catalogs against
 * {@link platformCanonicalLintConfig}; any workspace override that lowers a
 * rule in those namespaces from `error` to `off | info | warn` creates a
 * publish-gate divergence the user should know about (they'll see `error`
 * findings from the registry that don't appear locally).
 *
 * Workspace-only rule weakenings (`workspace/*`) do NOT trigger the banner —
 * those never reach publish.
 *
 * Returns the rule ids that trigger the banner, in catalog order, so the
 * renderer can produce stable deterministic output.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const detectPublishGateDrift = (config: LintConfig): ReadonlyArray<string> => {
  const overrides = config.rules ?? {};
  if (Object.keys(overrides).length === 0) {
    return [];
  }

  // Only the `id` and `severity` fields of each rule matter for drift
  // detection — rule-id snapshotting is public API, and severity is the
  // platform canonical default the workspace override weakens. The helper
  // is called against each catalog's concrete rule type so no assertion
  // is needed to widen the generic parameter.
  const weakened: Array<string> = [];
  const visitCatalog = (rules: typeof skillRules | typeof packRules): void => {
    for (const rule of rules) {
      if (rule.severity !== "error") {
        continue;
      }
      const override = overrides[rule.id];
      if (override === undefined) {
        continue;
      }
      if (override === "off" || override === "info" || override === "warn") {
        weakened.push(rule.id);
      }
    }
  };
  visitCatalog(skillRules);
  visitCatalog(packRules);

  return weakened;
};

// -----------------------------------------------------------------------------
// Human rendering (task 5.6)
// -----------------------------------------------------------------------------

/**
 * Input for the human text renderer.
 *
 * The `fixSummary` slot is reserved for the trailing `--fix` summary line
 * (populated after `applyPlan` completes). When `undefined`, no summary is
 * rendered — the read-only `axm lint` run.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface RenderFindingsArgs {
  readonly summary: LintSummary;
  readonly fixSummary?: FixSummary;
}

/**
 * Outcome of a `--fix` run; used by the renderer and the JSON emitter.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface FixSummary {
  readonly attempted: number;
  readonly applied: number;
  readonly failed: number;
  readonly warnings: ReadonlyArray<string>;
}

/**
 * Render a finding-first human text report.
 *
 * Output shape (one line per entry, grouped first by context type then by
 * severity within each group):
 *
 *     DRIFT: The registry will still block publish on these rules:
 *       - skill/manifest-schema-valid
 *
 *     WORKSPACE
 *       [error] workspace/lockfile-valid  axm-lock.yaml is missing.  ./axm-lock.yaml
 *       [warning] workspace/...  ...
 *
 *     SKILLS
 *       [error] ...
 *
 *     Summary: 2 errors, 1 warning.
 *     Applied 3 fixes; 1 warning surfaced from applyPlan.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const renderFindingsText = (args: RenderFindingsArgs): ReadonlyArray<string> => {
  const lines: Array<string> = [];
  const { summary, fixSummary } = args;

  if (summary.driftBanner.length > 0) {
    lines.push("DRIFT: The registry will still block publish on these rules:");
    for (const id of summary.driftBanner) {
      lines.push(`  - ${id}`);
    }
    lines.push("");
  }

  const groups: ReadonlyArray<{
    readonly key: "skill" | "pack" | "workspace";
    readonly label: string;
  }> = [
    { key: "workspace", label: "WORKSPACE" },
    { key: "skill", label: "SKILLS" },
    { key: "pack", label: "PACKS" },
  ];

  for (const group of groups) {
    const inGroup = summary.findings.filter((f) => f.group === group.key);
    if (inGroup.length === 0) {
      continue;
    }
    const sorted = [...inGroup].sort(
      (a, b) => severityOrder(a.finding.severity) - severityOrder(b.finding.severity),
    );
    lines.push(group.label);
    for (const entry of sorted) {
      lines.push(
        `  [${entry.finding.severity}] ${entry.finding.ruleId}  ${entry.finding.message}  ${entry.path}`,
      );
    }
    lines.push("");
  }

  if (summary.findings.length === 0 && summary.driftBanner.length === 0) {
    lines.push("No findings.");
  } else {
    lines.push(formatCountsSentence(summary.counts));
  }

  if (fixSummary !== undefined) {
    lines.push(formatFixSummary(fixSummary));
    for (const warning of fixSummary.warnings) {
      lines.push(`  warning: ${warning}`);
    }
  }

  return lines;
};

const formatCountsSentence = (counts: FindingCounts): string => {
  const parts: Array<string> = [];
  parts.push(`${counts.errors} ${pluralize(counts.errors, "error", "errors")}`);
  parts.push(`${counts.warnings} ${pluralize(counts.warnings, "warning", "warnings")}`);
  if (counts.infos > 0) {
    parts.push(`${counts.infos} ${pluralize(counts.infos, "info", "infos")}`);
  }
  return `Summary: ${parts.join(", ")}.`;
};

const formatFixSummary = (fix: FixSummary): string => {
  const appliedLabel = pluralize(fix.applied, "fix", "fixes");
  const warningsLabel = pluralize(fix.warnings.length, "warning", "warnings");
  return `Applied ${fix.applied} ${appliedLabel}; ${fix.warnings.length} ${warningsLabel}, ${fix.failed} failed.`;
};

const pluralize = (n: number, singular: string, plural: string): string =>
  n === 1 ? singular : plural;

// -----------------------------------------------------------------------------
// JSON document (task 5.6)
// -----------------------------------------------------------------------------

/**
 * JSON-renderable finding entry used by the `--json` document.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface LintJsonFinding {
  readonly group: "skill" | "pack" | "workspace";
  readonly kind: "autofixable" | "advisory";
  readonly ruleId: string;
  readonly severity: Severity;
  readonly message: string;
  readonly displayRoot: string;
  readonly path: string;
  readonly location?: {
    readonly file: string;
    readonly line?: number;
    readonly column?: number;
  };
  readonly suggestions: ReadonlyArray<string>;
}

/**
 * JSON envelope shape returned under `axm lint --json`.
 *
 * Mirrors the design doc §9 envelope for the CLI and matches the registry
 * publish failure envelope structure (`findings[]`, `displayRoot` per entry,
 * per-finding `path` pre-composed). `--fix` runs add a `fix` summary block.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface LintJsonDocument {
  readonly findings: ReadonlyArray<LintJsonFinding>;
  readonly summary: {
    readonly total: number;
    readonly errors: number;
    readonly warnings: number;
    readonly infos: number;
    readonly exitCategory: LintExitCategory;
  };
  readonly driftBanner: ReadonlyArray<string>;
  readonly fix?: {
    readonly attempted: number;
    readonly applied: number;
    readonly failed: number;
    readonly warnings: ReadonlyArray<string>;
  };
}

const toJsonFinding = (entry: RenderedFinding): LintJsonFinding => {
  const base = {
    group: entry.group,
    kind: entry.finding.kind,
    ruleId: entry.finding.ruleId,
    severity: entry.finding.severity,
    message: entry.finding.message,
    displayRoot: entry.displayRoot,
    path: entry.path,
    suggestions: [...entry.finding.suggestions],
  } as const;
  if (entry.finding.location === undefined) {
    return base;
  }
  const loc = {
    file: entry.finding.location.file,
    ...(entry.finding.location.line !== undefined ? { line: entry.finding.location.line } : {}),
    ...(entry.finding.location.column !== undefined
      ? { column: entry.finding.location.column }
      : {}),
  };
  return { ...base, location: loc };
};

/**
 * Build the `--json` document from a {@link LintSummary} (+ optional fix
 * summary).
 *
 * @experimental This API is unstable and may change without notice.
 */
export const toLintJsonDocument = (args: {
  readonly summary: LintSummary;
  readonly fixSummary?: FixSummary;
}): LintJsonDocument => {
  const { summary, fixSummary } = args;
  const base: LintJsonDocument = {
    findings: summary.findings.map(toJsonFinding),
    summary: {
      total: summary.counts.total,
      errors: summary.counts.errors,
      warnings: summary.counts.warnings,
      infos: summary.counts.infos,
      exitCategory: summary.exitCategory,
    },
    driftBanner: summary.driftBanner,
  };
  if (fixSummary === undefined) {
    return base;
  }
  return {
    ...base,
    fix: {
      attempted: fixSummary.attempted,
      applied: fixSummary.applied,
      failed: fixSummary.failed,
      warnings: fixSummary.warnings,
    },
  };
};

// -----------------------------------------------------------------------------
// Autofix rule surface (helper for the CLI handler)
// -----------------------------------------------------------------------------

/**
 * Walk workspace evaluations (the only v1 namespace that ships
 * `AutofixingRule`s) and return the set of `(rule, finding, context)` triples
 * the CLI handler can dispatch on to produce canonical Operations.
 *
 * The returned triples point at the already-evaluated `AutofixableFinding`
 * values so the renderer and the fix pipeline share a single source of truth.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const collectAutofixableEntries = (
  evaluations: GroupEvaluations,
): ReadonlyArray<{
  readonly rule: AutofixingRule<WorkspaceRuleContext>;
  readonly context: WorkspaceRuleContext;
  readonly finding: LintFinding & { readonly kind: "autofixable" };
}> => {
  const out: Array<{
    readonly rule: AutofixingRule<WorkspaceRuleContext>;
    readonly context: WorkspaceRuleContext;
    readonly finding: LintFinding & { readonly kind: "autofixable" };
  }> = [];
  for (const entry of evaluations.workspace) {
    if (entry.rule.kind !== "autofixing") {
      continue;
    }
    for (const finding of entry.findings) {
      if (finding.kind === "autofixable") {
        out.push({ rule: entry.rule, context: entry.context, finding });
      }
    }
  }
  return out;
};

// -----------------------------------------------------------------------------
// Re-exports that CLI callers use alongside the runner
// -----------------------------------------------------------------------------

export { platformCanonicalLintConfig };
