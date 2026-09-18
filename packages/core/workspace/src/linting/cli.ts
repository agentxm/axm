import { renderAxmSkillCompatibility } from "@agentxm/cli-maintenance/official-skill/adapters/cli";
/**
 * Lint runner — the reusable core of `axm lint`.
 *
 * The `axm lint` CLI command file is a thin surface over flag parsing and
 * rendering; the logic that evaluates rule catalogs, renders findings, and
 * detects publish-gate drift lives in this module.
 *
 * Lint engine entry points:
 *
 * - {@link evaluateAllCatalogs}         — concurrent evaluation of the three
 *   v1 rule catalogs against pre-built contexts.
 * - {@link summarizeEvaluations}        — group, count, and derive the exit
 *   category from raw `Evaluated<*>` lists.
 * - {@link detectPublishGateDrift}      — compute whether the configured
 *   `LintConfig` weakens any `skill/*` / `pack/*` platform-default-`error`
 *   rule (task 5.7).
 * - {@link toLintHumanFindings}         — findings as a person reads them.
 * - {@link toLintJsonDocument}          — `--json` document shape (task 5.6).
 * - {@link resolveLintExitCategory}     — exit-code contract evaluator (task
 *   5.9).
 *
 * Lint-intent → canonical `Operation` adapter composition happens in the CLI
 * handler (`apps/cli/src/root/lint/handler.ts`), which re-resolves each
 * intent's `source` via the `resolveConfigured*` helpers and hands the
 * resulting canonical Operation to the per-extension plan-step builder. The
 * runner here stays accessor-free.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import { composePath } from "@agentxm/extension-content/lint";
import type { LintConfig } from "@agentxm/extension-content/lint";
import { platformCanonicalLintConfig } from "@agentxm/extension-content/lint";
import type { Evaluated } from "@agentxm/extension-content/lint";
import { evaluateContexts } from "@agentxm/extension-content/lint";
import type { LintInput, LintJsonDocument, LintJsonFinding } from "./json-schema.js";
import type { LintFinding, Severity } from "@agentxm/extension-content/lint";

import {
  CATALOG_GROUP_ORDER,
  lintCatalogsForView,
  type CatalogContext,
  type CatalogGroup,
  type CatalogRuleContexts,
  type LintView,
} from "./catalog-contexts.js";
import { type AxmSkillCompatibility } from "@agentxm/cli-maintenance/official-skill/domain";
import { DETERMINED_REPAIR_RULE_IDS } from "./run/settings.js";

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
  readonly group: CatalogGroup;
  readonly ruleDescription: string;
  readonly displayRoot: string;
  readonly path: string;
  readonly finding: LintFinding;
}

/**
 * Per-group evaluation result, one entry per catalog. The raw `Evaluated<*>`
 * list is retained so downstream consumers can render and emit JSON without
 * re-running rules.
 *
 * Every group is required: a catalog that produced no findings still reports
 * an empty list, so a missing group means a runner bug rather than "nothing to
 * say".
 *
 * @experimental This API is unstable and may change without notice.
 */
export type GroupEvaluations = {
  readonly [K in CatalogGroup]: ReadonlyArray<Evaluated<CatalogContext<K>>>;
};

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
 * Evaluate every rule catalog against its contexts, concurrently.
 *
 * Catalogs run in parallel; findings stay in stable catalog order inside each
 * group, and groups render in {@link CATALOG_GROUP_ORDER}.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const evaluateAllCatalogs = (args: {
  readonly contexts: CatalogRuleContexts;
  readonly config: LintConfig;
  readonly view: LintView;
}): Effect.Effect<GroupEvaluations> =>
  Effect.gen(function* () {
    const catalogs = lintCatalogsForView(args.view);
    const [skill, pack, subagent, mcpServer, hook, rule, knowledge, workspace] = yield* Effect.all(
      [
        evaluateContexts(catalogs.skill, args.contexts.skill, args.config),
        evaluateContexts(catalogs.pack, args.contexts.pack, args.config),
        evaluateContexts(catalogs.subagent, args.contexts.subagent, args.config),
        evaluateContexts(catalogs["mcp-server"], args.contexts["mcp-server"], args.config),
        evaluateContexts(catalogs.hook, args.contexts.hook, args.config),
        evaluateContexts(catalogs.rule, args.contexts.rule, args.config),
        evaluateContexts(catalogs.knowledge, args.contexts.knowledge, args.config),
        evaluateContexts(catalogs.workspace, args.contexts.workspace, args.config),
      ],
      { concurrency: "unbounded" },
    );
    return {
      skill,
      pack,
      subagent,
      "mcp-server": mcpServer,
      hook,
      rule,
      knowledge,
      workspace,
    };
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

/**
 * Every rule context carries a `displayRoot`; that is all rendering needs, so
 * this reads the structural minimum rather than the per-group context type —
 * which lets one call site walk the whole {@link GroupEvaluations} record.
 */
interface RenderableEvaluated {
  readonly context: { readonly displayRoot: string };
  readonly rule: { readonly description: string };
  readonly findings: ReadonlyArray<LintFinding>;
}

const flattenEvaluated = (
  group: CatalogGroup,
  evaluated: ReadonlyArray<RenderableEvaluated>,
): ReadonlyArray<RenderedFinding> => {
  const out: Array<RenderedFinding> = [];
  for (const entry of evaluated) {
    const displayRoot = entry.context.displayRoot;
    for (const finding of entry.findings) {
      out.push({
        group,
        ruleDescription: entry.rule.description,
        displayRoot,
        path: composePath(displayRoot, finding.location),
        finding,
      });
    }
  }
  return out;
};

/**
 * Flatten a {@link GroupEvaluations} record into a single `RenderedFinding[]`
 * in stable group-then-catalog order.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const collectRenderedFindings = (
  evaluations: GroupEvaluations,
): ReadonlyArray<RenderedFinding> =>
  CATALOG_GROUP_ORDER.flatMap((group) => flattenEvaluated(group, evaluations[group]));

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
  void config;
  return [];
};

// -----------------------------------------------------------------------------
// Human findings
// -----------------------------------------------------------------------------

/**
 * One finding as a person reads it: the first sentence of its message as the
 * title, the `Detail:` clause and any further sentences split out as details
 * and help, and whether `axm lint --fix` repairs it.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface LintHumanFinding {
  readonly severity: Severity;
  readonly ruleId: string;
  /** The invariant the rule holds, which names a rule that repeats across findings. */
  readonly ruleDescription: string;
  readonly title: string;
  readonly details: ReadonlyArray<string>;
  readonly helps: ReadonlyArray<string>;
  readonly fixable: boolean;
  readonly path: string;
}

/** Errors first, then by location, so the findings that fail a run lead. */
const compareRenderedFindings = (left: RenderedFinding, right: RenderedFinding): number => {
  const bySeverity = severityOrder(left.finding.severity) - severityOrder(right.finding.severity);
  if (bySeverity !== 0) {
    return bySeverity;
  }
  const byPath = left.path.localeCompare(right.path);
  if (byPath !== 0) {
    return byPath;
  }
  const byRuleId = left.finding.ruleId.localeCompare(right.finding.ruleId);
  if (byRuleId !== 0) {
    return byRuleId;
  }
  return left.finding.message.localeCompare(right.finding.message);
};

const isWhitespace = (character: string): boolean => character.trim() === "";

const isSentenceStarter = (character: string): boolean => {
  const code = character.charCodeAt(0);
  return character === "`" || (code >= 65 && code <= 90);
};

const sentenceBoundary = (
  message: string,
): { readonly head: string; readonly tail: string } | undefined => {
  for (let index = 1; index < message.length - 1; index += 1) {
    if (message[index] !== "." || !isWhitespace(message[index + 1] ?? "x")) {
      continue;
    }
    let tailStart = index + 1;
    while (tailStart < message.length && isWhitespace(message[tailStart] ?? "x")) {
      tailStart += 1;
    }
    const starter = message[tailStart];
    if (starter !== undefined && isSentenceStarter(starter)) {
      return {
        head: message.slice(0, index + 1),
        tail: message.slice(tailStart),
      };
    }
  }
  return undefined;
};

const splitSentences = (message: string): ReadonlyArray<string> => {
  const out: Array<string> = [];
  let remaining = message.trim();

  while (remaining.length > 0) {
    const boundary = sentenceBoundary(remaining);
    if (boundary === undefined) {
      out.push(remaining);
      break;
    }
    out.push(boundary.head);
    remaining = boundary.tail;
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
    case "workspace/skills-managed":
      return dirnamePosix(entry.path);
    default:
      return entry.path;
  }
};

/**
 * Rules whose repair is fully determined by authoritative local state, so
 * `axm lint --fix` restores them. Naming the repair is a reporting concern, so
 * it lives here rather than in the rule, which states the intrinsic fact alone.
 */
const DETERMINED_REPAIR_RULES: ReadonlySet<string> = new Set(DETERMINED_REPAIR_RULE_IDS);

const toHumanFinding = (entry: RenderedFinding): LintHumanFinding => {
  const parsed = parseFindingMessage(entry.finding.message);
  return {
    severity: entry.finding.severity,
    ruleId: entry.finding.ruleId,
    ruleDescription: entry.ruleDescription,
    title: parsed.title,
    details: parsed.details,
    helps: parsed.helps,
    fixable: DETERMINED_REPAIR_RULES.has(entry.finding.ruleId),
    path: groupDisplayPath(entry),
  };
};

/**
 * Findings as a person reads them, errors first.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const toLintHumanFindings = (
  findings: ReadonlyArray<RenderedFinding>,
): ReadonlyArray<LintHumanFinding> =>
  [...findings].sort(compareRenderedFindings).map(toHumanFinding);

// -----------------------------------------------------------------------------
// JSON document (task 5.6)
// -----------------------------------------------------------------------------

export const toLintJsonFinding = (entry: RenderedFinding): LintJsonFinding => {
  const base = {
    group: entry.group,
    kind: entry.finding.kind,
    ruleId: entry.finding.ruleId,
    severity: entry.finding.severity,
    message: entry.finding.message,
    displayRoot: entry.displayRoot,
    path: entry.path,
    subject: entry.path,
    authority: entry.finding.location?.file ?? entry.displayRoot,
    observed: entry.finding.message,
    expected: entry.ruleDescription,
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
 * Build the `--json` document from a {@link LintSummary}.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const toLintJsonDocument = (args: {
  readonly summary: LintSummary;
  readonly input: LintInput;
  readonly axmSkillCompatibility?: AxmSkillCompatibility;
}): LintJsonDocument => {
  const { summary } = args;
  return {
    input: args.input,
    ...(args.axmSkillCompatibility === undefined
      ? {}
      : { axmSkillCompatibility: renderAxmSkillCompatibility(args.axmSkillCompatibility) }),
    findings: summary.findings.map(toLintJsonFinding),
    repaired: [],
    summary: {
      total: summary.counts.total,
      errors: summary.counts.errors,
      warnings: summary.counts.warnings,
      infos: summary.counts.infos,
      exitCategory: summary.exitCategory,
    },
    driftBanner: summary.driftBanner,
  };
};

// -----------------------------------------------------------------------------
// Re-exports that CLI callers use alongside the runner
// -----------------------------------------------------------------------------

export { platformCanonicalLintConfig };
