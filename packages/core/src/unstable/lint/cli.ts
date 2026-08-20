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
import type { LintInput, LintJsonDocument, LintJsonFinding } from "./json-schema.js";
import type { LintFinding, Severity } from "./rule.js";
import type { AxmSkillCompatibility } from "../skills/axm-skill-compatibility.js";
import {
  CATALOG_GROUP_ORDER,
  lintCatalogsForView,
  type CatalogContext,
  type CatalogGroup,
  type CatalogRuleContexts,
  type LintView,
} from "./catalog-contexts.js";

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
 * WorkspaceMutations-only rule weakenings (`workspace/*`) do NOT trigger the banner —
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
// Human rendering (task 5.6)
// -----------------------------------------------------------------------------

/**
 * Input for the human text renderer.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type LintHumanReporter = "grouped" | "full" | "summary";

export interface RenderFindingsArgs {
  readonly summary: LintSummary;
  readonly reporter?: LintHumanReporter;
}

export interface LintHumanDiagnostic {
  readonly severity: Severity;
  readonly ruleId: string;
  readonly title: string;
  readonly details: ReadonlyArray<string>;
  readonly helps: ReadonlyArray<string>;
  readonly fixable: boolean;
  readonly paths: ReadonlyArray<string>;
}

export type LintHumanBlock =
  | {
      readonly kind: "overview";
      readonly message: string;
      readonly counts: FindingCounts;
      readonly notes: ReadonlyArray<string>;
    }
  | {
      readonly kind: "driftBanner";
      readonly title: string;
      readonly ruleIds: ReadonlyArray<string>;
    }
  | {
      readonly kind: "section";
      readonly title: string;
      readonly note?: string;
    }
  | {
      readonly kind: "diagnostic";
      readonly diagnostic: LintHumanDiagnostic;
    }
  | {
      readonly kind: "pathGroup";
      readonly path: string;
      readonly diagnostics: ReadonlyArray<LintHumanDiagnostic>;
    }
  | {
      readonly kind: "blank";
    }
  | {
      readonly kind: "empty";
      readonly message: string;
    }
  | {
      readonly kind: "footer";
      readonly message: string;
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

const defaultHumanReporter: LintHumanReporter = "grouped";

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

const pluralize = (n: number, singular: string, plural: string): string =>
  n === 1 ? singular : plural;

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
    case "workspace/skills-managed":
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
    case "workspace/skills-managed":
      if (parsed.title.includes("but it is not managed by this workspace.")) {
        return "unmanaged";
      }
      return "managed";
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
    case "workspace/instructions-target-current":
      return "target-health";
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
    fixable: false,
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

const sortStrings = (values: ReadonlyArray<string>): ReadonlyArray<string> => [...values].sort();

const uniquePaths = (findings: ReadonlyArray<ParsedLintHumanFinding>): ReadonlyArray<string> =>
  uniqueStrings(findings.map((finding) => finding.path));

const mergedRuleHelps = (
  findings: ReadonlyArray<ParsedLintHumanFinding>,
  autofixHelp: string,
): ReadonlyArray<string> => {
  if (findings.every((finding) => finding.fixable)) {
    return [autofixHelp];
  }
  const helps = uniqueStrings(findings.flatMap((finding) => finding.helps));
  return helps.length > 0
    ? helps
    : findings.some((finding) => finding.fixable)
      ? [autofixHelp]
      : [];
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

const previewList = (values: ReadonlyArray<string>, limit = 3): string => {
  if (values.length === 0) {
    return "";
  }
  if (values.length <= limit) {
    return values.join(", ");
  }
  const remaining = values.length - limit;
  return `${values.slice(0, limit).join(", ")}, ... and ${remaining} more`;
};

const groupFindingsByPath = <A>(
  findings: ReadonlyArray<ParsedLintHumanFinding>,
  extract: (finding: ParsedLintHumanFinding) => A,
): ReadonlyArray<readonly [string, ReadonlyArray<A>]> => {
  const grouped = new Map<string, Array<A>>();
  for (const finding of findings) {
    const current = grouped.get(finding.path);
    const value = extract(finding);
    if (current === undefined) {
      grouped.set(finding.path, [value]);
    } else {
      current.push(value);
    }
  }
  return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right));
};

const coalesceFullDiagnostic = (
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
      paths: [],
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
      paths: [first.path],
    };
  }

  const allHelps = uniqueStrings(findings.flatMap((finding) => finding.helps));
  const paths = uniquePaths(findings);

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
        helps: [
          "Regenerate `.axm/axm-lock.yaml` from `.axm/settings.json` by reinstalling the declared extensions.",
        ],
        fixable: false,
        paths,
      };
    }
    case "workspace/skills-managed:unmanaged": {
      const names = findings.flatMap((finding) => {
        const name = matchSingleQuoted(finding.title);
        return name === undefined ? [] : [name];
      });
      return {
        severity: first.severity,
        ruleId: first.ruleId,
        title: `${names.length} ${pluralize(names.length, "skill is", "skills are")} present here but not managed by this workspace.`,
        details: compressDetails(names),
        helps: [
          "Review ownership before changing each unowned skill.",
          "Use `axm adopt @owner/skills/<name>` to transfer an existing canonical package into AXM ownership.",
        ],
        fixable: false,
        paths,
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
        helps: mergedRuleHelps(
          findings,
          "Run `axm sync` to reconcile the declared agent artifacts.",
        ),
        fixable: findings.some((finding) => finding.fixable),
        paths,
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
        helps: ["Run `axm sync` to reconcile desired skills with accepted resolutions."],
        fixable: true,
        paths,
      };
    case "workspace/skills-integrity-valid:integrity":
      return {
        severity: first.severity,
        ruleId: first.ruleId,
        title: "Skills listed in the lockfile are missing their installed sources.",
        details: compressDetails(findings.map(summarizeSkillByDetail)),
        helps: mergedRuleHelps(findings, "Run `axm sync` to restore the affected skills."),
        fixable: findings.some((finding) => finding.fixable),
        paths,
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
        paths,
      };
  }
};

const coalesceGroupedDiagnostic = (
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
      paths: [],
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
      paths: [first.path],
    };
  }

  const paths = uniquePaths(findings);
  const allHelps = uniqueStrings(findings.flatMap((finding) => finding.helps));

  switch (`${first.ruleId}:${first.bucket}`) {
    case "workspace/lockfile-valid:missing-required-field": {
      const fields = sortStrings(
        uniqueStrings(
          findings.flatMap((finding) => {
            const match = /Lockfile is missing required field `([^`]+)`\./.exec(finding.title);
            return match?.[1] === undefined ? [] : [match[1]];
          }),
        ),
      );
      return {
        severity: first.severity,
        ruleId: first.ruleId,
        title: "Lockfile is missing fields required by the current schema.",
        details: [`Missing fields include: ${previewList(fields, 4)}`],
        helps: [
          "Fix: Regenerate `.axm/axm-lock.yaml` from `.axm/settings.json` by reinstalling the declared extensions.",
        ],
        fixable: false,
        paths,
      };
    }
    case "workspace/skills-managed:unmanaged": {
      const perPath = groupFindingsByPath(
        findings,
        (finding) => matchSingleQuoted(finding.title) ?? finding.title,
      );
      return {
        severity: first.severity,
        ruleId: first.ruleId,
        title: `Unmanaged skills are present in ${paths.length} ${pluralize(paths.length, "skill directory", "skill directories")}.`,
        details: compressDetails(
          perPath.map(([path, names]) => {
            const sorted = sortStrings(uniqueStrings(names));
            return `${path}: ${sorted.length} unmanaged ${pluralize(sorted.length, "skill", "skills")} (${previewList(sorted, 3)})`;
          }),
          8,
        ),
        helps: [
          "Review ownership before changing each unowned skill.",
          "Use `axm adopt @owner/skills/<name>` to transfer an existing canonical package into AXM ownership.",
        ],
        fixable: false,
        paths,
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
        helps: mergedRuleHelps(
          findings,
          "Run `axm sync` to reconcile the declared agent artifacts.",
        ),
        fixable: findings.some((finding) => finding.fixable),
        paths,
      };
    case "workspace/skills-lockfile-aligned:missing":
    case "workspace/skills-lockfile-aligned:orphan":
    case "workspace/skills-lockfile-aligned:version":
    case "workspace/skills-lockfile-aligned:alignment":
      return {
        severity: first.severity,
        ruleId: first.ruleId,
        title: "`settings.skills` and the lockfile are out of sync.",
        details: compressDetails(findings.map(summarizeSkillByDetail)),
        helps: ["Run `axm sync` to reconcile desired skills with accepted resolutions."],
        fixable: true,
        paths,
      };
    case "workspace/skills-integrity-valid:integrity":
      return {
        severity: first.severity,
        ruleId: first.ruleId,
        title: "Skills listed in the lockfile are missing their installed sources.",
        details: compressDetails(findings.map(summarizeSkillByDetail)),
        helps: mergedRuleHelps(findings, "Run `axm sync` to restore the affected skills."),
        fixable: findings.some((finding) => finding.fixable),
        paths,
      };
    default:
      return {
        severity: first.severity,
        ruleId: first.ruleId,
        title:
          findings.length === 1
            ? first.title
            : `${findings.length} related findings were reported.`,
        details: compressDetails(
          findings.map((finding) => {
            const detail =
              finding.details.length === 0
                ? finding.title
                : `${finding.title}: ${finding.details.join("; ")}`;
            return paths.length === 1 ? detail : `${finding.path}: ${detail}`;
          }),
        ),
        helps: allHelps,
        fixable: findings.some((finding) => finding.fixable),
        paths,
      };
  }
};

/**
 * Repairs whose desired state is fully determined by authoritative local state,
 * keyed by rule. Naming the operation is a reporting concern, so it lives here
 * rather than in the rule, which states the intrinsic fact alone.
 */
const DETERMINED_REPAIRS: Readonly<Record<string, string>> = {
  "workspace/instructions-target-current":
    "Fix: Run `axm lint --fix` to regenerate the instruction files from their canonical source.",
  "workspace/instructions-target-stale":
    "Fix: Run `axm lint --fix` to remove AXM-owned instruction files the configuration no longer needs.",
};

const withDeterminedRepair = (diagnostic: LintHumanDiagnostic): LintHumanDiagnostic => {
  const repair = DETERMINED_REPAIRS[diagnostic.ruleId];
  if (repair === undefined) return diagnostic;
  return {
    ...diagnostic,
    helps: diagnostic.helps.includes(repair) ? diagnostic.helps : [...diagnostic.helps, repair],
    fixable: true,
  };
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

const formatFullOverviewSentence = (args: {
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
  return `${base} ${args.fixableCount} ${pluralize(args.fixableCount, "finding can", "findings can")} be auto-fixed.`;
};

const formatGroupedOverviewSentence = (args: {
  readonly diagnosticCount: number;
  readonly fixableCount: number;
}): string => {
  const parts = [`${args.diagnosticCount} ${pluralize(args.diagnosticCount, "issue", "issues")}.`];
  if (args.fixableCount > 0) {
    parts.push(
      `${args.fixableCount} ${pluralize(args.fixableCount, "can", "can")} be fixed automatically.`,
    );
  }
  const manualCount = args.diagnosticCount - args.fixableCount;
  if (manualCount > 0) {
    parts.push(`${manualCount} ${pluralize(manualCount, "needs", "need")} manual attention.`);
  }
  return parts.join(" ");
};

const buildFullDiagnostics = (
  parsed: ReadonlyArray<ParsedLintHumanFinding>,
): ReadonlyArray<LintHumanBlock> => {
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

  const blocks: Array<LintHumanBlock> = [];
  pathOrder.forEach((path, index) => {
    const pathEntries = byPath.get(path);
    if (pathEntries === undefined) {
      return;
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
        return grouped === undefined ? [] : [withDeterminedRepair(coalesceFullDiagnostic(grouped))];
      }),
    });

    if (index < pathOrder.length - 1) {
      blocks.push({ kind: "blank" });
    }
  });

  return blocks;
};

const groupedBucketKey = (entry: ParsedLintHumanFinding): string => {
  switch (entry.ruleId) {
    case "workspace/skills-managed":
      return `${entry.ruleId}:${entry.bucket}`;
    default:
      return `${entry.path}:${entry.ruleId}:${entry.bucket}`;
  }
};

const buildGroupedDiagnostics = (
  parsed: ReadonlyArray<ParsedLintHumanFinding>,
): ReadonlyArray<LintHumanDiagnostic> => {
  const groups = new Map<string, Array<ParsedLintHumanFinding>>();
  const order: Array<string> = [];

  for (const entry of parsed) {
    const key = groupedBucketKey(entry);
    const current = groups.get(key);
    if (current === undefined) {
      groups.set(key, [entry]);
      order.push(key);
    } else {
      current.push(entry);
    }
  }

  return order.flatMap((key) => {
    const grouped = groups.get(key);
    return grouped === undefined ? [] : [withDeterminedRepair(coalesceGroupedDiagnostic(grouped))];
  });
};

const appendDiagnosticSection = (
  blocks: Array<LintHumanBlock>,
  title: string,
  diagnostics: ReadonlyArray<LintHumanDiagnostic>,
  note?: string,
) => {
  if (diagnostics.length === 0) {
    return;
  }
  if (blocks.length > 0) {
    blocks.push({ kind: "blank" });
  }
  blocks.push(note === undefined ? { kind: "section", title } : { kind: "section", title, note });
  diagnostics.forEach((diagnostic, index) => {
    blocks.push({ kind: "diagnostic", diagnostic });
    if (index < diagnostics.length - 1) {
      blocks.push({ kind: "blank" });
    }
  });
};

const buildSectionedDiagnostics = (args: {
  readonly blocks: Array<LintHumanBlock>;
  readonly diagnostics: ReadonlyArray<LintHumanDiagnostic>;
}) => {
  const manual = args.diagnostics.filter((diagnostic) => diagnostic.severity === "error");
  const warnings = args.diagnostics.filter((diagnostic) => diagnostic.severity === "warning");
  const infos = args.diagnostics.filter((diagnostic) => diagnostic.severity === "info");

  appendDiagnosticSection(args.blocks, "Requires manual attention", manual);
  appendDiagnosticSection(args.blocks, "Warnings", warnings);
  appendDiagnosticSection(args.blocks, "Information", infos);
};

const makeSummaryDiagnostic = (diagnostic: LintHumanDiagnostic): LintHumanDiagnostic => ({
  ...diagnostic,
  details:
    diagnostic.paths.length === 1
      ? ["1 affected location"]
      : [
          `${diagnostic.paths.length} affected ${pluralize(diagnostic.paths.length, "location", "locations")}`,
        ],
  helps: [],
});

const toFullLintHumanBlocks = (args: RenderFindingsArgs): ReadonlyArray<LintHumanBlock> => {
  const blocks: Array<LintHumanBlock> = [];
  const { summary } = args;

  if (summary.findings.length === 0) {
    blocks.push(
      summary.driftBanner.length === 0
        ? { kind: "empty", message: "No findings." }
        : { kind: "empty", message: "No local findings." },
    );
  } else {
    const parsed = [...summary.findings].sort(compareRenderedFindings).map(parseHumanFinding);
    const locationCount = uniqueStrings(parsed.map((finding) => finding.path)).length;
    const fixableCount = 0;
    blocks.push({
      kind: "overview",
      message: formatFullOverviewSentence({
        counts: summary.counts,
        locationCount,
        fixableCount,
      }),
      counts: summary.counts,
      notes: [],
    });

    if (summary.driftBanner.length > 0) {
      blocks.push({ kind: "blank" });
      blocks.push({
        kind: "driftBanner",
        title: "The registry will still block publish on these rules:",
        ruleIds: summary.driftBanner,
      });
    }

    const diagnostics = buildFullDiagnostics(parsed);
    if (diagnostics.length > 0) {
      blocks.push({ kind: "blank" });
      blocks.push(...diagnostics);
    }
  }

  if (summary.findings.length === 0 && summary.driftBanner.length > 0) {
    blocks.push({ kind: "blank" });
    blocks.push({
      kind: "driftBanner",
      title: "The registry will still block publish on these rules:",
      ruleIds: summary.driftBanner,
    });
  }

  return blocks;
};

const toGroupedLintHumanBlocks = (args: RenderFindingsArgs): ReadonlyArray<LintHumanBlock> => {
  const blocks: Array<LintHumanBlock> = [];
  const { summary } = args;

  if (summary.findings.length === 0) {
    blocks.push(
      summary.driftBanner.length === 0
        ? { kind: "empty", message: "No findings." }
        : { kind: "empty", message: "No local findings." },
    );
  } else {
    const parsed = [...summary.findings].sort(compareRenderedFindings).map(parseHumanFinding);
    const diagnostics = buildGroupedDiagnostics(parsed);
    const fixableCount = diagnostics.filter((diagnostic) => diagnostic.fixable).length;

    blocks.push({
      kind: "overview",
      message: formatGroupedOverviewSentence({
        diagnosticCount: diagnostics.length,
        fixableCount,
      }),
      counts: summary.counts,
      notes: [],
    });

    if (summary.driftBanner.length > 0) {
      blocks.push({ kind: "blank" });
      blocks.push({
        kind: "driftBanner",
        title: "The registry will still block publish on these rules:",
        ruleIds: summary.driftBanner,
      });
    }

    buildSectionedDiagnostics({ blocks, diagnostics });
  }

  if (summary.findings.length === 0 && summary.driftBanner.length > 0) {
    blocks.push({ kind: "blank" });
    blocks.push({
      kind: "driftBanner",
      title: "The registry will still block publish on these rules:",
      ruleIds: summary.driftBanner,
    });
  }

  if (summary.findings.length > 0) {
    blocks.push({ kind: "blank" });
    blocks.push({
      kind: "footer",
      message: "More output: `axm lint --details` | `axm lint --json`",
    });
  }

  return blocks;
};

const toSummaryLintHumanBlocks = (args: RenderFindingsArgs): ReadonlyArray<LintHumanBlock> => {
  const blocks: Array<LintHumanBlock> = [];
  const { summary } = args;

  if (summary.findings.length === 0) {
    blocks.push(
      summary.driftBanner.length === 0
        ? { kind: "empty", message: "No findings." }
        : { kind: "empty", message: "No local findings." },
    );
  } else {
    const parsed = [...summary.findings].sort(compareRenderedFindings).map(parseHumanFinding);
    const diagnostics = buildGroupedDiagnostics(parsed).map(makeSummaryDiagnostic);
    const fixableCount = diagnostics.filter((diagnostic) => diagnostic.fixable).length;
    blocks.push({
      kind: "overview",
      message: formatGroupedOverviewSentence({
        diagnosticCount: diagnostics.length,
        fixableCount,
      }),
      counts: summary.counts,
      notes: [],
    });

    if (summary.driftBanner.length > 0) {
      blocks.push({ kind: "blank" });
      blocks.push({
        kind: "driftBanner",
        title: "The registry will still block publish on these rules:",
        ruleIds: summary.driftBanner,
      });
    }

    buildSectionedDiagnostics({ blocks, diagnostics });
  }

  if (summary.findings.length === 0 && summary.driftBanner.length > 0) {
    blocks.push({ kind: "blank" });
    blocks.push({
      kind: "driftBanner",
      title: "The registry will still block publish on these rules:",
      ruleIds: summary.driftBanner,
    });
  }

  return blocks;
};

export const toLintHumanBlocks = (args: RenderFindingsArgs): ReadonlyArray<LintHumanBlock> => {
  switch (args.reporter ?? defaultHumanReporter) {
    case "full":
      return toFullLintHumanBlocks(args);
    case "summary":
      return toSummaryLintHumanBlocks(args);
    case "grouped":
      return toGroupedLintHumanBlocks(args);
  }
};

export const renderFindingsText = (args: RenderFindingsArgs): ReadonlyArray<string> => {
  const lines: Array<string> = [];

  for (const block of toLintHumanBlocks(args)) {
    switch (block.kind) {
      case "overview":
        lines.push(block.message);
        for (const note of block.notes) {
          lines.push(note);
        }
        break;
      case "driftBanner":
        lines.push(`DRIFT: ${block.title}`);
        for (const id of block.ruleIds) {
          lines.push(`  - ${id}`);
        }
        break;
      case "section": {
        const label = block.note !== undefined ? `${block.title} (${block.note})` : block.title;
        lines.push(label);
        break;
      }
      case "diagnostic": {
        const location =
          block.diagnostic.paths.length === 1
            ? (block.diagnostic.paths[0] ?? "")
            : block.diagnostic.paths.length > 1
              ? `(${block.diagnostic.paths.length} locations)`
              : "(workspace)";
        lines.push(`  [${block.diagnostic.severity}] ${location}`);
        lines.push(
          `  rule: ${block.diagnostic.ruleId}${block.diagnostic.fixable ? " (auto-fixable)" : ""}`,
        );
        lines.push(`  ${block.diagnostic.title}`);
        for (const detail of block.diagnostic.details) {
          lines.push(`  - ${detail}`);
        }
        for (const help of block.diagnostic.helps) {
          lines.push(`  ${help}`);
        }
        break;
      }
      case "pathGroup":
        lines.push(block.path);
        for (const diagnostic of block.diagnostics) {
          lines.push(
            `  [${diagnostic.severity}] ${diagnostic.ruleId}${diagnostic.fixable ? " (auto-fixable)" : ""}: ${diagnostic.title}`,
          );
          for (const detail of diagnostic.details) {
            lines.push(`    - ${detail}`);
          }
          for (const help of diagnostic.helps) {
            lines.push(`    ${help}`);
          }
        }
        break;
      case "blank":
        lines.push("");
        break;
      case "empty":
        lines.push(block.message);
        break;
      case "footer":
        lines.push(block.message);
        break;
    }
  }

  return lines;
};

// -----------------------------------------------------------------------------
// JSON document (task 5.6)
// -----------------------------------------------------------------------------

const toJsonFinding = (entry: RenderedFinding): LintJsonFinding => {
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
      : { axmSkillCompatibility: args.axmSkillCompatibility }),
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
};

// -----------------------------------------------------------------------------
// Re-exports that CLI callers use alongside the runner
// -----------------------------------------------------------------------------

export { platformCanonicalLintConfig };
