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
 * Human-renderable diagnostic entry for a single rendered path group.
 *
 * This stays lint-owned: the handler maps the entry onto generic renderer
 * chrome (`error`, `warn`, `info`, `message`) without the renderer needing to
 * know about lint-specific concepts.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface LintHumanDiagnostic {
  readonly severity: Severity;
  readonly ruleId: string;
  readonly title: string;
  readonly details: ReadonlyArray<string>;
  readonly helps: ReadonlyArray<string>;
  readonly fixable: boolean;
}

/**
 * Structured human-output blocks for `axm lint`.
 *
 * The block model is intentionally separate from both terminal text and the
 * JSON document shape. It gives the CLI handler enough structure to render
 * human diagnostics cleanly without teaching `CliRenderer` about lint.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type LintHumanBlock =
  | {
      readonly kind: "overview";
      readonly message: string;
      readonly counts: FindingCounts;
      readonly nextStep?: string;
    }
  | {
      readonly kind: "driftBanner";
      readonly title: string;
      readonly ruleIds: ReadonlyArray<string>;
    }
  | {
      readonly kind: "pathGroup";
      readonly path: string;
      readonly diagnostics: ReadonlyArray<LintHumanDiagnostic>;
    }
  | {
      readonly kind: "empty";
      readonly message: string;
    }
  | {
      readonly kind: "fixSummary";
      readonly message: string;
      readonly summary: FixSummary;
    };

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

const compareRenderedFindings = (left: RenderedFinding, right: RenderedFinding): number => {
  const byPath = left.path.localeCompare(right.path);
  if (byPath !== 0) {
    return byPath;
  }
  const bySeverity = severityOrder(left.finding.severity) - severityOrder(right.finding.severity);
  if (bySeverity !== 0) {
    return bySeverity;
  }
  const byRuleId = left.finding.ruleId.localeCompare(right.finding.ruleId);
  if (byRuleId !== 0) {
    return byRuleId;
  }
  return left.finding.message.localeCompare(right.finding.message);
};

interface ParsedLintHumanFinding {
  readonly path: string;
  readonly bucket: string;
  readonly severity: Severity;
  readonly ruleId: string;
  readonly title: string;
  readonly details: ReadonlyArray<string>;
  readonly helps: ReadonlyArray<string>;
  readonly fixable: boolean;
}

const splitSentences = (message: string): ReadonlyArray<string> => {
  const out: Array<string> = [];
  let remaining = message.trim();

  while (remaining.length > 0) {
    const match = /^(.+?\.(?=\s+[A-Z`]))\s+(.+)$/.exec(remaining);
    if (match === null) {
      out.push(remaining);
      break;
    }
    const head = match[1];
    const tail = match[2];
    if (head === undefined || tail === undefined) {
      out.push(remaining);
      break;
    }
    out.push(head);
    remaining = tail;
  }

  return out;
};

const splitDetailClause = (
  message: string,
): {
  readonly lead: string;
  readonly detail: string | undefined;
  readonly trailing: ReadonlyArray<string>;
} => {
  const marker = " Detail: ";
  const index = message.indexOf(marker);
  if (index === -1) {
    return {
      lead: message,
      detail: undefined,
      trailing: [],
    };
  }

  const lead = message.slice(0, index);
  const rest = message.slice(index + marker.length);
  const sentences = splitSentences(rest);
  const detail = sentences[0];
  return {
    lead,
    detail,
    trailing: sentences.slice(1),
  };
};

const parseFindingMessage = (
  message: string,
): {
  readonly title: string;
  readonly details: ReadonlyArray<string>;
  readonly helps: ReadonlyArray<string>;
} => {
  const detailSplit = splitDetailClause(message);
  const leadSentences = splitSentences(detailSplit.lead);
  const title = leadSentences[0] ?? message.trim();
  const details = detailSplit.detail === undefined ? [] : [detailSplit.detail];
  return {
    title,
    details,
    helps: [...leadSentences.slice(1), ...detailSplit.trailing],
  };
};

const dirnamePosix = (path: string): string => {
  if (path === "." || path === "..") {
    return path;
  }
  const index = path.lastIndexOf("/");
  if (index <= 0) {
    return path;
  }
  return path.slice(0, index);
};

const groupDisplayPath = (entry: RenderedFinding): string => {
  switch (entry.finding.ruleId) {
    case "workspace/skills-artifacts-clean":
      return dirnamePosix(entry.path);
    default:
      return entry.path;
  }
};

const bucketForFinding = (entry: RenderedFinding, parsed: { readonly title: string }): string => {
  switch (entry.finding.ruleId) {
    case "workspace/lockfile-valid":
      if (parsed.title.startsWith("Lockfile is missing required field `")) {
        return "missing-required-field";
      }
      if (parsed.title.startsWith("The lockfile is not valid YAML.")) {
        return "invalid-yaml";
      }
      return "validation";
    case "workspace/skills-artifacts-clean":
      if (parsed.title.includes("but its installed source directory is missing.")) {
        return "dangling";
      }
      if (parsed.title.includes("but it is not listed in settings.skills.")) {
        return "stale";
      }
      if (parsed.title.includes("but settings.skills declares it as")) {
        return "name-mismatch";
      }
      return "artifact";
    case "workspace/skills-artifacts-correct":
      return "artifact-state";
    case "workspace/skills-lockfile-aligned":
      if (parsed.title.includes("missing from the lockfile.")) {
        return "missing";
      }
      if (parsed.title.includes("listed in the lockfile but not in settings.skills.")) {
        return "orphan";
      }
      if (parsed.title.includes("lockfile version does not match the declared version.")) {
        return "version";
      }
      return "alignment";
    case "workspace/skills-integrity-valid":
      return "integrity";
    default:
      return entry.finding.ruleId;
  }
};

const parseHumanFinding = (entry: RenderedFinding): ParsedLintHumanFinding => {
  const parsed = parseFindingMessage(entry.finding.message);
  return {
    path: groupDisplayPath(entry),
    bucket: bucketForFinding(entry, parsed),
    severity: entry.finding.severity,
    ruleId: entry.finding.ruleId,
    title: parsed.title,
    details: parsed.details,
    helps: parsed.helps,
    fixable: entry.finding.kind === "autofixable",
  };
};

const matchSingleQuoted = (message: string): string | undefined => {
  const match = /'([^']+)'/.exec(message);
  return match?.[1];
};

const uniqueStrings = (values: ReadonlyArray<string>): ReadonlyArray<string> => {
  const out: Array<string> = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    out.push(value);
  }
  return out;
};

const summarizeSkillByDetail = (finding: ParsedLintHumanFinding): string => {
  const name = matchSingleQuoted(finding.title);
  const detail = finding.details[0];
  if (name === undefined) {
    return detail ?? finding.title;
  }
  if (detail === undefined) {
    return name;
  }
  return `${name}: ${detail}`;
};

const compressDetails = (details: ReadonlyArray<string>, limit = 10): ReadonlyArray<string> => {
  if (details.length <= limit) {
    return details;
  }
  const remaining = details.length - limit;
  return [...details.slice(0, limit), `... and ${remaining} more`];
};

const coalesceDiagnostics = (
  findings: ReadonlyArray<ParsedLintHumanFinding>,
): LintHumanDiagnostic => {
  const [first] = findings;
  if (first === undefined) {
    return {
      severity: "info",
      ruleId: "",
      title: "",
      details: [],
      helps: [],
      fixable: false,
    };
  }

  if (findings.length === 1) {
    return {
      severity: first.severity,
      ruleId: first.ruleId,
      title: first.title,
      details: first.details,
      helps: first.helps,
      fixable: first.fixable,
    };
  }

  const allHelps = uniqueStrings(findings.flatMap((finding) => finding.helps));

  switch (`${first.ruleId}:${first.bucket}`) {
    case "workspace/lockfile-valid:missing-required-field": {
      const fields = findings.flatMap((finding) => {
        const match = /Lockfile is missing required field `([^`]+)`\./.exec(finding.title);
        return match?.[1] === undefined ? [] : [match[1]];
      });
      return {
        severity: first.severity,
        ruleId: first.ruleId,
        title: "Lockfile is missing required fields.",
        details: compressDetails(fields),
        helps: ["Add the missing fields at the referenced locations."],
        fixable: false,
      };
    }
    case "workspace/skills-artifacts-clean:stale": {
      const names = findings.flatMap((finding) => {
        const name = matchSingleQuoted(finding.title);
        return name === undefined ? [] : [name];
      });
      return {
        severity: first.severity,
        ruleId: first.ruleId,
        title: `${names.length} ${pluralize(names.length, "skill is", "skills are")} present here but not listed in settings.skills.`,
        details: compressDetails(names),
        helps: [
          "Add them to settings.skills if axm should manage them.",
          "Otherwise remove them from this directory.",
        ],
        fixable: false,
      };
    }
    case "workspace/skills-artifacts-clean:dangling": {
      const names = findings.flatMap((finding) => {
        const name = matchSingleQuoted(finding.title);
        return name === undefined ? [] : [name];
      });
      return {
        severity: first.severity,
        ruleId: first.ruleId,
        title: `${names.length} ${pluralize(names.length, "skill is", "skills are")} present here, but the installed source directory is missing.`,
        details: compressDetails(names),
        helps: ["Run `axm lint --fix` to reinstall them and restore the missing source files."],
        fixable: true,
      };
    }
    case "workspace/skills-artifacts-clean:name-mismatch": {
      const names = findings.map((finding) => {
        const match =
          /Skill '([^']+)' is present .* settings\.skills declares it as '([^']+)'\./.exec(
            finding.title,
          );
        if (match === null) {
          return finding.title;
        }
        const actual = match[1];
        const expected = match[2];
        if (actual === undefined || expected === undefined) {
          return finding.title;
        }
        return `${actual} -> ${expected}`;
      });
      return {
        severity: first.severity,
        ruleId: first.ruleId,
        title: "Some skills in this directory do not match the names declared in settings.skills.",
        details: compressDetails(names),
        helps: [
          "Remove the mismatched directories and reinstall the declared skill names if axm should manage them.",
        ],
        fixable: false,
      };
    }
    case "workspace/skills-artifacts-correct:enabled-missing":
    case "workspace/skills-artifacts-correct:disabled-present":
    case "workspace/skills-artifacts-correct:inconsistent":
    case "workspace/skills-artifacts-correct:artifact-state":
      return {
        severity: first.severity,
        ruleId: first.ruleId,
        title: `${findings.length} ${pluralize(findings.length, "skill is", "skills are")} inconsistent across the declared agents.`,
        details: compressDetails(findings.map(summarizeSkillByDetail)),
        helps: ["Run `axm lint --fix` to reconcile the declared agent artifacts."],
        fixable: true,
      };
    case "workspace/skills-lockfile-aligned:missing":
    case "workspace/skills-lockfile-aligned:orphan":
    case "workspace/skills-lockfile-aligned:version":
    case "workspace/skills-lockfile-aligned:alignment":
      return {
        severity: first.severity,
        ruleId: first.ruleId,
        title: "Skill declarations and lockfile entries are out of sync.",
        details: compressDetails(findings.map(summarizeSkillByDetail)),
        helps: ["Run `axm lint --fix` to reconcile settings.skills with the lockfile."],
        fixable: true,
      };
    case "workspace/skills-integrity-valid:integrity":
      return {
        severity: first.severity,
        ruleId: first.ruleId,
        title: "Installed skill sources do not match their lockfile entries.",
        details: compressDetails(findings.map(summarizeSkillByDetail)),
        helps: ["Run `axm lint --fix` to reinstall the affected skills."],
        fixable: true,
      };
    default:
      return {
        severity: first.severity,
        ruleId: first.ruleId,
        title: `${findings.length} findings reported for this rule.`,
        details: compressDetails(
          findings.map((finding) =>
            finding.details.length === 0
              ? finding.title
              : `${finding.title}: ${finding.details.join("; ")}`,
          ),
        ),
        helps: allHelps,
        fixable: findings.some((finding) => finding.fixable),
      };
  }
};

const joinList = (values: ReadonlyArray<string>): string => {
  if (values.length === 0) {
    return "";
  }
  if (values.length === 1) {
    return values[0] ?? "";
  }
  if (values.length === 2) {
    const first = values[0] ?? "";
    const second = values[1] ?? "";
    return `${first} and ${second}`;
  }
  const head = values.slice(0, -1).join(", ");
  const tail = values[values.length - 1] ?? "";
  return `${head}, and ${tail}`;
};

const formatOverviewSentence = (args: {
  readonly counts: FindingCounts;
  readonly locationCount: number;
  readonly fixableCount: number;
}): string => {
  const parts: Array<string> = [];
  if (args.counts.errors > 0) {
    parts.push(`${args.counts.errors} ${pluralize(args.counts.errors, "error", "errors")}`);
  }
  if (args.counts.warnings > 0) {
    parts.push(`${args.counts.warnings} ${pluralize(args.counts.warnings, "warning", "warnings")}`);
  }
  if (args.counts.infos > 0) {
    parts.push(`${args.counts.infos} ${pluralize(args.counts.infos, "info", "infos")}`);
  }

  const locations = `${args.locationCount} ${pluralize(args.locationCount, "location", "locations")}`;
  const base = `Found ${joinList(parts)} in ${locations}.`;
  if (args.fixableCount === 0) {
    return base;
  }
  const fixable =
    args.fixableCount === 1
      ? "1 finding is fixable."
      : `${args.fixableCount} findings are fixable.`;
  return `${base} ${fixable}`;
};

/**
 * Build structured human-output blocks for a lint run.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const toLintHumanBlocks = (args: RenderFindingsArgs): ReadonlyArray<LintHumanBlock> => {
  const blocks: Array<LintHumanBlock> = [];
  const { summary, fixSummary } = args;

  if (summary.findings.length === 0) {
    blocks.push(
      summary.driftBanner.length === 0
        ? { kind: "empty", message: "No findings." }
        : { kind: "empty", message: "No local findings." },
    );
  } else {
    const parsed = [...summary.findings].sort(compareRenderedFindings).map(parseHumanFinding);
    const pathOrder: Array<string> = [];
    const byPath = new Map<string, Array<ParsedLintHumanFinding>>();

    for (const entry of parsed) {
      const current = byPath.get(entry.path);
      if (current === undefined) {
        byPath.set(entry.path, [entry]);
        pathOrder.push(entry.path);
      } else {
        current.push(entry);
      }
    }

    const locationCount = byPath.size;
    const fixableCount = summary.findings.filter(
      (finding) => finding.finding.kind === "autofixable",
    ).length;
    blocks.push({
      kind: "overview",
      message: formatOverviewSentence({
        counts: summary.counts,
        locationCount,
        fixableCount,
      }),
      counts: summary.counts,
      ...(fixableCount > 0 && fixSummary === undefined
        ? { nextStep: "Run `axm lint --fix` for the fixable findings." }
        : {}),
    });

    if (summary.driftBanner.length > 0) {
      blocks.push({
        kind: "driftBanner",
        title: "The registry will still block publish on these rules:",
        ruleIds: summary.driftBanner,
      });
    }

    for (const path of pathOrder) {
      const pathEntries = byPath.get(path);
      if (pathEntries === undefined) {
        continue;
      }

      const groups = new Map<string, Array<ParsedLintHumanFinding>>();
      const groupOrder: Array<string> = [];
      for (const entry of pathEntries) {
        const key = `${severityOrder(entry.severity)}:${entry.ruleId}:${entry.bucket}`;
        const current = groups.get(key);
        if (current === undefined) {
          groups.set(key, [entry]);
          groupOrder.push(key);
        } else {
          current.push(entry);
        }
      }

      blocks.push({
        kind: "pathGroup",
        path,
        diagnostics: groupOrder.flatMap((key) => {
          const grouped = groups.get(key);
          return grouped === undefined ? [] : [coalesceDiagnostics(grouped)];
        }),
      });
    }
  }

  if (summary.findings.length === 0 && summary.driftBanner.length > 0) {
    blocks.push({
      kind: "driftBanner",
      title: "The registry will still block publish on these rules:",
      ruleIds: summary.driftBanner,
    });
  }

  if (fixSummary !== undefined) {
    blocks.push({
      kind: "fixSummary",
      message: formatFixSummary(fixSummary),
      summary: fixSummary,
    });
  }

  return blocks;
};

/**
 * Render a finding-first human text report.
 *
 * Output shape (one block per rendered path, with rule metadata and message on
 * detail/help lines):
 *
 *     Found 3 errors in 2 locations. 1 finding is fixable.
 *     Next step: run `axm lint --fix` for the fixable findings.
 *
 *     ./.axm/axm-lock.yaml
 *       [error] workspace/lockfile-valid (fixable): Lockfile is missing
 *       required fields.
 *         - packs.effect.owner
 *         Add the missing fields at the referenced locations.
 *
 *     Applied 3 fixes; 1 warning surfaced from applyPlan.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const renderFindingsText = (args: RenderFindingsArgs): ReadonlyArray<string> => {
  const lines: Array<string> = [];

  for (const block of toLintHumanBlocks(args)) {
    switch (block.kind) {
      case "overview":
        lines.push(block.message);
        if (block.nextStep !== undefined) {
          lines.push(`Next step: ${block.nextStep}`);
        }
        break;
      case "driftBanner":
        lines.push(`DRIFT: ${block.title}`);
        for (const id of block.ruleIds) {
          lines.push(`  - ${id}`);
        }
        break;
      case "pathGroup":
        lines.push(block.path);
        for (const diagnostic of block.diagnostics) {
          lines.push(
            `  [${diagnostic.severity}] ${diagnostic.ruleId}${diagnostic.fixable ? " (fixable)" : ""}: ${diagnostic.title}`,
          );
          for (const detail of diagnostic.details) {
            lines.push(`    - ${detail}`);
          }
          for (const help of diagnostic.helps) {
            lines.push(`    ${help}`);
          }
        }
        break;
      case "empty":
        lines.push(block.message);
        break;
      case "fixSummary":
        lines.push(block.message);
        for (const warning of block.summary.warnings) {
          lines.push(`  warning: ${warning}`);
        }
        break;
    }
  }

  return lines;
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
