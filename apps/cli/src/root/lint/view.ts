import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import type { FindingCounts } from "@agentxm/workspace/linting";
import type { LintHumanFinding } from "./human-findings.js";

import type { VerbosityLevel } from "../../cli-flags/index.js";
import type {
  Doc,
  DocNode,
  LedgerColumn,
  LedgerRow,
  Mark,
  Span,
  Text,
  Tone,
} from "../../screen/index.js";
import { count, exitPhrase, factParts, ledgerViewPolicy, scopePhrase } from "../../screen/index.js";

/**
 * A rule reported at this many locations folds into one row with a location
 * count; `--verbose` lists every location instead.
 */
export const FOLD_THRESHOLD = 3;

/** How many of a folded rule's locations its child line names before counting the rest. */
const FOLD_PREVIEW = 2;

const FOLD_HINT = "--verbose lists every location";

export interface LintViewInput {
  /** What remains after the run, errors first. */
  readonly findings: ReadonlyArray<LintHumanFinding>;
  /** What `--fix` repaired. */
  readonly repaired: ReadonlyArray<LintHumanFinding>;
  readonly counts: FindingCounts;
  /** Rules the registry still blocks publish on although local configuration weakens them. */
  readonly driftBanner: ReadonlyArray<string>;
  readonly fix: boolean;
  readonly scope: WorkspaceScope;
  readonly exitCode: number;
  readonly verbosity: VerbosityLevel;
}

const columns: ReadonlyArray<LedgerColumn> = [
  { header: "Finding", role: "name" },
  { header: "Location", role: "elastic", priority: "required" },
  { header: "Fix", role: "fixed", priority: "preferred" },
];

const severityMark = (severity: LintHumanFinding["severity"]): Mark => {
  switch (severity) {
    case "error":
      return "error";
    case "warning":
      return "warn";
    case "info":
      return "info";
  }
};

/** A finding's title reads as a ledger cell, not a sentence. */
const cellText = (sentence: string): string => sentence.replace(/\.$/, "");

const fixCell = (fixable: boolean): Text => (fixable ? [{ text: "fixable", tone: "ok" }] : "");

const childLine = (lead: string, rest: string | undefined): DocNode => ({
  _tag: "paragraph",
  tone: "dim",
  text: rest === undefined ? lead : `${lead} — ${cellText(rest)}`,
});

/** The rule and the first thing it says beyond the title; verbose adds the rest. */
const findingChildren = (finding: LintHumanFinding, detailed: boolean): Doc => {
  const said = [...finding.details, ...finding.helps];
  const [first, ...rest] = said;
  return [
    childLine(finding.ruleId, first),
    ...(detailed ? rest.map((line) => childLine(cellText(line), undefined)) : []),
  ];
};

const findingRow = (finding: LintHumanFinding, detailed: boolean): LedgerRow => ({
  mark: severityMark(finding.severity),
  cells: [cellText(finding.title), finding.path, fixCell(finding.fixable)],
  children: findingChildren(finding, detailed),
});

const uniquePaths = (findings: ReadonlyArray<LintHumanFinding>): ReadonlyArray<string> => [
  ...new Set(findings.map((finding) => finding.path)),
];

const previewPaths = (paths: ReadonlyArray<string>): string => {
  const shown = paths.slice(0, FOLD_PREVIEW);
  const more = paths.length - shown.length;
  return more === 0 ? shown.join(", ") : `${shown.join(", ")}, and ${String(more)} more`;
};

/**
 * One row for a rule that repeats: its shared title, or the invariant the rule
 * holds when the findings say different things, and how many places it holds
 * at, with the first few named beneath.
 */
const foldedRow = (findings: ReadonlyArray<LintHumanFinding>): LedgerRow | undefined => {
  const [first] = findings;
  if (first === undefined) return undefined;
  const titles = new Set(findings.map((finding) => finding.title));
  const paths = uniquePaths(findings);
  return {
    mark: severityMark(first.severity),
    cells: [
      cellText(titles.size === 1 ? first.title : first.ruleDescription),
      paths.length === 1 ? first.path : count(paths.length, "location"),
      fixCell(findings.some((finding) => finding.fixable)),
    ],
    children: [childLine(first.ruleId, paths.length === 1 ? undefined : previewPaths(paths))],
  };
};

const fixedRow = (finding: LintHumanFinding): LedgerRow => ({
  mark: "update",
  cells: [cellText(finding.title), finding.path, [{ text: "fixed", tone: "ok" }]],
});

/** Findings grouped by rule, in the order each rule first appears. */
const byRule = (
  findings: ReadonlyArray<LintHumanFinding>,
): ReadonlyArray<ReadonlyArray<LintHumanFinding>> => {
  const groups = new Map<string, Array<LintHumanFinding>>();
  for (const finding of findings) {
    const group = groups.get(finding.ruleId);
    if (group === undefined) groups.set(finding.ruleId, [finding]);
    else group.push(finding);
  }
  return [...groups.values()];
};

const findingRows = (
  findings: ReadonlyArray<LintHumanFinding>,
  detailed: boolean,
): { readonly rows: ReadonlyArray<LedgerRow>; readonly folded: boolean } => {
  if (detailed)
    return { rows: findings.map((finding) => findingRow(finding, true)), folded: false };
  const groups = byRule(findings);
  return {
    rows: groups.flatMap((group) => {
      if (group.length < FOLD_THRESHOLD) return group.map((finding) => findingRow(finding, false));
      const row = foldedRow(group);
      return row === undefined ? [] : [row];
    }),
    folded: groups.some((group) => group.length >= FOLD_THRESHOLD),
  };
};

const severityCounts = (
  counts: FindingCounts,
  options?: { readonly withInfos: boolean },
): ReadonlyArray<Span> =>
  (
    [
      { value: counts.errors, noun: "error", tone: "error" },
      { value: counts.warnings, noun: "warning", tone: "warn" },
      { value: options?.withInfos === false ? 0 : counts.infos, noun: "info", tone: "info" },
    ] as const
  )
    .filter((part) => part.value > 0)
    .flatMap((part, index) => [
      ...(index === 0 ? [] : [{ text: ", " }]),
      { text: count(part.value, part.noun), tone: part.tone, bold: true },
    ]);

const verdictTone = (counts: FindingCounts): Tone =>
  counts.errors > 0 ? "error" : counts.warnings > 0 ? "warn" : counts.infos > 0 ? "info" : "ok";

const exitPart = (exitCode: number): string | undefined =>
  exitCode === 0 ? undefined : exitPhrase(exitCode);

const fixSuggestion = (fixable: number): SuggestedAction => ({
  description: `apply the ${fixable === 1 ? "deterministic fix" : `${String(fixable)} deterministic fixes`}`,
  cmd: "axm lint --fix",
});

/**
 * What `--fix` settled: how many it fixed, and the errors and warnings that
 * still need a person. Informational findings ask nothing of anyone, so they
 * stay in the ledger and out of the claim.
 */
const fixVerdict = (input: LintViewInput): DocNode => {
  const remaining = severityCounts(input.counts, { withInfos: false });
  const fixed =
    input.repaired.length === 0
      ? "Nothing was fixable"
      : `Fixed ${count(input.repaired.length, "finding")}`;
  const aside = exitPart(input.exitCode);
  return {
    _tag: "headline",
    verdict: true,
    tone: remaining.length === 0 ? "ok" : verdictTone({ ...input.counts, infos: 0 }),
    text: [
      { text: fixed, bold: true },
      ...(remaining.length === 0
        ? []
        : [{ text: ", " }, ...remaining, { text: " still need you" }]),
    ],
    ...(aside === undefined ? {} : { aside: factParts([aside]) }),
  };
};

const driftCallout = (ruleIds: ReadonlyArray<string>): Doc =>
  ruleIds.length === 0
    ? []
    : [
        {
          _tag: "callout",
          tone: "warn",
          title: "The registry will still block publish on these rules",
          children: ruleIds.map((id) => ({ _tag: "paragraph", tone: "dim", text: id }) as const),
        },
      ];

/**
 * `axm lint` as a ledger: one row per finding — what is wrong, where, and
 * whether `--fix` repairs it — with the rule and what it says on a dim line
 * beneath, errors first. A rule that repeats folds into one row with a
 * location count. `--fix` puts what it fixed in the same ledger as ordinary
 * fixed rows, above what remains. The verdict carries the counts, how many
 * are fixable, and the exit code when the run fails.
 */
export const lintDoc = (input: LintViewInput): Doc => {
  const { detailed, quiet } = ledgerViewPolicy(input.verbosity);
  const remaining = findingRows(input.findings, detailed);
  const rows = [...input.repaired.map(fixedRow), ...remaining.rows];
  const fixable = input.findings.filter((finding) => finding.fixable).length;

  if (rows.length === 0) {
    const verdict: DocNode = {
      _tag: "headline",
      tone: "ok",
      text: input.driftBanner.length === 0 ? "No findings" : "No other findings",
      aside: factParts([scopePhrase(input.scope)]),
    };
    return quiet ? [verdict] : [...driftCallout(input.driftBanner), verdict];
  }

  const aside = factParts([
    remaining.folded ? `in ${count(uniquePaths(input.findings).length, "location")}` : undefined,
    fixable === 0 || input.fix ? undefined : `${String(fixable)} fixable`,
    exitPart(input.exitCode),
  ]);
  const verdict: DocNode = input.fix
    ? fixVerdict(input)
    : {
        _tag: "headline",
        verdict: true,
        tone: verdictTone(input.counts),
        text: severityCounts(input.counts),
        ...(aside.length === 0 ? {} : { aside }),
      };
  if (quiet) return [verdict];

  const drift = driftCallout(input.driftBanner);
  return [
    {
      _tag: "headline",
      tone: "neutral",
      text: [{ text: input.fix ? "Fixing" : "Linting", bold: true }],
      aside: factParts([scopePhrase(input.scope)]),
    },
    ...drift,
    { _tag: "ledger", columns, rows },
    verdict,
    ...(remaining.folded ? [{ _tag: "paragraph", tone: "dim", text: FOLD_HINT } as const] : []),
    ...(fixable === 0 || input.fix
      ? []
      : [{ _tag: "next", actions: [fixSuggestion(fixable)] } as const]),
  ];
};
