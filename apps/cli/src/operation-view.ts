import * as Option from "effect/Option";
import * as Effect from "effect/Effect";

import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import {
  countUnitStates,
  defaultOperationPresentation,
  deriveOperationOutcome,
  presentationOf,
  unitIdOf,
  type JobStepArtifact,
  type JobStepArtifactReference,
  type OperationPresentation,
  type OperationResolution,
  type Plan,
  type PlannedJobStep,
  type ResolvedUnit,
  type UnitState,
  type UnitStateCounts,
} from "@agentxm/workspace/transitions/planning";

import { Verbosity, type VerbosityLevel } from "./cli-flags/index.js";
import type {
  Change,
  Doc,
  LedgerColumn,
  LedgerFold,
  LedgerRow,
  Span,
  Status,
  Tone,
} from "./screen/doc.js";
import { Screen } from "./screen/screen.js";
import {
  agentOutcome,
  artifactChange,
  artifactChangeMark,
  blockingClass,
  count,
  disposition,
  interruptionPhrase,
  operationTitle,
  outcomeHeadline,
  planVerdict,
  plannedArtifactChange,
  scopePhrase,
  subjectHeader,
  subjectNoun,
  unitState,
  unitStateChange,
} from "./screen/phrases.js";

/**
 * Separates the parts of one cell or aside. The painter owns the separator
 * glyph, which a view cannot reach and must not spell, so a cell that carries
 * several facts joins them as prose instead.
 */
const SEPARATOR = ", ";

/** Stands in the version column for a unit that carries no version of its own. */
const NO_VERSION = "—";

const joined = (parts: ReadonlyArray<string | undefined>): string =>
  parts
    .filter((part): part is string => part !== undefined && part.trim().length > 0)
    .join(SEPARATOR);

/**
 * A title and a verdict are the two bold lines of a result. A verdict that
 * follows a ledger also carries no glyph, because the rows already do.
 */
const emphatic = (value: string): ReadonlyArray<Span> => [{ text: value, bold: true }];

const artifactPaths = (artifact: JobStepArtifact): string =>
  artifact.targets === undefined || artifact.targets.length === 0
    ? artifact.path
    : artifact.targets
        .map((target) =>
          target.entryName === undefined ? target.path : `${target.path} (${target.entryName})`,
        )
        .join(", ");

/**
 * The detail column: what a reader needs beyond the name, the version, and
 * the outcome. It is the ledger's elastic column, so it takes the spare width
 * and is the first to give way when there is none.
 */
const detailCell = (
  artifact: JobStepArtifact | undefined,
  extra: ReadonlyArray<string | undefined>,
): string =>
  joined([
    artifact?.previousVersion === undefined ? undefined : `from ${artifact.previousVersion}`,
    artifact?.fileCount === undefined ? undefined : count(artifact.fileCount, "file"),
    ...extra,
    artifact === undefined ? undefined : artifactPaths(artifact),
  ]);

const versionCell = (artifact: JobStepArtifact | undefined): string =>
  artifact?.version === undefined || artifact.version.length === 0 ? NO_VERSION : artifact.version;

/**
 * Plan, progress, and result ledgers differ only in their third column — what
 * is planned against what happened — so both are built from one shape.
 */
const ledgerColumns = (
  presentation: OperationPresentation,
  outcomeHeader: "Plan" | "Status",
): ReadonlyArray<LedgerColumn> => [
  { header: subjectHeader(presentation), role: "name" },
  { header: "Version", role: "fixed", priority: "preferred" },
  { header: outcomeHeader, role: "fixed", priority: "required" },
  { header: "Detail", role: "elastic", priority: "optional" },
];

const membershipChildren = (artifact: JobStepArtifact | undefined): Doc => {
  if (artifact?.packMembership === undefined) return [];
  return [
    {
      _tag: "rows",
      rows: artifact.packMembership.members.map((member) => ({
        _tag: "row",
        change: member.before === null ? "create" : member.after === null ? "remove" : "update",
        cells: [
          member.member,
          member.before === null
            ? member.after
            : member.after === null
              ? member.before
              : `${member.before} to ${member.after}`,
        ],
      })),
    },
  ];
};

/**
 * Per-agent outcomes and pack membership beneath the row they belong to. A
 * pack's members are the substance of its change, so they always show;
 * verbose level adds every agent to the agents that did not take the change,
 * because those are the ones a reader has to act on either way.
 */
const rowChildren = (
  unit: {
    readonly artifact?: JobStepArtifact;
    readonly agentOutcomes?: ResolvedUnit<unknown>["agentOutcomes"];
  },
  detailed: boolean,
): Doc => {
  const outcomes = (unit.agentOutcomes ?? unit.artifact?.agentOutcomes ?? []).filter(
    (outcome) => detailed || outcome.outcome === "failed" || outcome.outcome === "blocked",
  );
  return [
    ...membershipChildren(unit.artifact),
    ...outcomes.map(
      (outcome) =>
        ({
          _tag: "paragraph",
          tone: outcome.outcome === "failed" || outcome.outcome === "blocked" ? "warn" : "dim",
          text: joined([
            `${outcome.agentId}: ${agentOutcome(outcome.outcome)}${outcome.path === undefined ? "" : ` at ${outcome.path}`}`,
            outcome.reason,
          ]),
        }) as const,
    ),
  ];
};

const withChildren = (row: LedgerRow, children: Doc): LedgerRow =>
  children.length === 0 ? row : { ...row, children };

/** The mark a settled row carries: its change when it changed as planned. */
const resultMark = (unit: ResolvedUnit<unknown>): Change | Status =>
  unit.state === "committed" && unit.artifact !== undefined
    ? artifactChangeMark(unit.artifact.change)
    : unitStateChange(unit.state);

const resultRow = (unit: ResolvedUnit<unknown>, detailed: boolean): LedgerRow =>
  withChildren(
    {
      id: unitIdOf(unit),
      mark: resultMark(unit),
      cells: [
        unit.artifact?.packMembership?.pack ?? unit.label,
        versionCell(unit.artifact),
        unit.state === "committed" && unit.artifact !== undefined
          ? artifactChange(unit.artifact.change)
          : unitState(unit.state),
        detailCell(unit.artifact, [
          // An artifact's change already says what happened, so its own
          // message would only repeat the status column.
          unit.artifact === undefined ? unit.message : undefined,
          unit.disposition === undefined ? undefined : disposition(unit.disposition),
        ]),
      ],
    },
    rowChildren(unit, detailed),
  );

const planRow = (
  step: PlannedJobStep<unknown, unknown>,
  presentation: OperationPresentation,
  detailed: boolean,
): LedgerRow =>
  withChildren(
    {
      id: unitIdOf(step),
      mark:
        step.readiness === "error"
          ? "blocked"
          : step.artifact === undefined
            ? "create"
            : artifactChangeMark(step.artifact.change),
      cells: [
        step.artifact?.packMembership?.pack ?? step.label,
        versionCell(step.artifact),
        step.artifact === undefined
          ? presentation.verb.imperative
          : plannedArtifactChange(step.artifact.change),
        detailCell(step.artifact, [
          step.readiness === "warn" ? step.warnMessage : undefined,
          step.readiness === "error" ? step.errorMessage : undefined,
        ]),
      ],
    },
    rowChildren(step, detailed),
  );

/**
 * The groups a ledger folds because they repeat one outcome: the units that
 * were already current and the ones the selection left out. Verbose level
 * lists them instead, which is what the fold's hint names.
 */
const FOLD_HINT = "--verbose to list";

interface FoldGroup {
  readonly count: number;
  readonly noun: string;
}

const foldGroups = (
  presentation: OperationPresentation,
  groups: ReadonlyArray<{ readonly count: number; readonly state: UnitState }>,
): ReadonlyArray<FoldGroup> =>
  groups
    .filter((group) => group.count > 0)
    .map((group) => ({
      count: group.count,
      noun: `${subjectNoun(presentation, group.count)} ${unitState(group.state)}`,
    }));

/**
 * One ledger carries one fold line, so a second group follows it as its own
 * line; neither the already-current nor the not-selected count is lost.
 */
const foldedLedger = (
  columns: ReadonlyArray<LedgerColumn>,
  rows: ReadonlyArray<LedgerRow>,
  folds: ReadonlyArray<FoldGroup>,
): Doc => {
  const [first, ...rest] = folds;
  if (rows.length === 0 && first === undefined) return [];
  return [
    {
      _tag: "ledger",
      columns,
      rows,
      ...(first === undefined
        ? {}
        : { folded: { mark: "unchanged", ...first, hint: FOLD_HINT } satisfies LedgerFold }),
    },
    ...rest.map(
      (fold) => ({ _tag: "collapsed", change: "unchanged", ...fold, hint: FOLD_HINT }) as const,
    ),
  ];
};

const headlineTone = (outcome: ReturnType<typeof deriveOperationOutcome>): Tone => {
  switch (outcome) {
    case "previewed":
      return "info";
    case "applied":
    case "no-op":
      return "ok";
    case "partial":
    case "blocked":
    case "cancelled":
      return "warn";
    case "failed":
    case "interrupted":
      return "error";
  }
};

const groupedWarnings = (units: ReadonlyArray<ResolvedUnit<unknown>>): Doc => {
  const groups = new Map<string, Array<string>>();
  for (const unit of units) {
    for (const warning of unit.warnings ?? []) {
      const labels = groups.get(warning) ?? [];
      labels.push(unit.label);
      groups.set(warning, labels);
    }
  }
  return [...groups].map(
    ([warning, labels]) =>
      ({
        _tag: "callout",
        tone: "warn",
        title: warning,
        children: [{ _tag: "paragraph", tone: "dim", text: labels.join(", ") }],
      }) as const,
  );
};

const referenceOf = (unit: ResolvedUnit<unknown>): ReadonlyArray<JobStepArtifactReference> =>
  (unit.artifact?.references ?? []).filter((reference) => reference.state !== "absent");

/**
 * What the operation left alone: paths it observed but does not own, so a
 * reader is not left wondering why they survived. They are the operation's
 * context, not its units, so they follow the ledger as a callout.
 */
const untouchedPaths = (units: ReadonlyArray<ResolvedUnit<unknown>>): Doc => {
  const references = units.flatMap(referenceOf);
  if (references.length === 0) return [];
  return [
    {
      _tag: "callout",
      tone: "warn",
      title: `AXM will not touch ${count(references.length, "path")}`,
      children: references.map(
        (reference) =>
          ({
            _tag: "paragraph",
            tone: "dim",
            text: joined([reference.path, reference.reason]),
          }) as const,
      ),
    },
  ];
};

const agentCoverage = (units: ReadonlyArray<ResolvedUnit<unknown>>): ReadonlyArray<string> => [
  ...new Set(
    units.flatMap((unit) =>
      unit.state === "committed" || unit.state === "unchanged"
        ? (unit.artifact?.agents ?? []).filter((agent) => agent !== "universal")
        : [],
    ),
  ),
];

export interface AgentCoverageSummary {
  readonly agents: ReadonlyArray<string>;
  readonly scope: "project" | "user";
}

export const resolutionAgentCoverage = (
  resolution: OperationResolution<unknown>,
): AgentCoverageSummary | undefined => {
  const agents = agentCoverage(resolution.units);
  const scope = resolution.units.find(
    (unit) =>
      (unit.state === "committed" || unit.state === "unchanged") &&
      unit.artifact?.agents !== undefined,
  )?.artifact?.scope;
  return scope === undefined ? undefined : { agents, scope };
};

/**
 * The title line: what the command is doing, where, and for which agents. It
 * opens both the plan and the settled result, so the facts a reader orients
 * by are stated once and never repeated in the rows. A document with no
 * ledger has nothing to orient, and its verdict stands alone.
 */
const titleLine = (
  presentation: OperationPresentation,
  mode: "preview" | "apply",
  where: {
    readonly ledger: boolean;
    readonly scope?: "project" | "user";
    readonly agents?: ReadonlyArray<string>;
  },
): Doc => {
  if (!where.ledger) return [];
  const aside = joined([
    where.scope === undefined ? undefined : scopePhrase(where.scope),
    where.agents === undefined || where.agents.length === 0
      ? undefined
      : `agents: ${where.agents.join(", ")}`,
  ]);
  return [
    {
      _tag: "headline",
      tone: "neutral",
      text: emphatic(operationTitle(presentation, mode)),
      ...(aside.length === 0 ? {} : { aside }),
    },
  ];
};

/** The counts a verdict carries as its aside: how much, never what happened. */
const verdictAside = (
  presentation: OperationPresentation,
  counts: UnitStateCounts,
  mode: "preview" | "apply",
): string =>
  joined([
    ...(
      [
        { value: counts.committed, noun: unitState("committed") },
        { value: counts.failed, noun: unitState("failed") },
        { value: counts.blocked, noun: unitState("blocked") },
        { value: counts.rolledBack, noun: unitState("rolled-back") },
        { value: counts.unchanged, noun: unitState("unchanged") },
        { value: counts.skipped, noun: unitState("skipped") },
      ] as const
    ).map((part) => (part.value === 0 ? undefined : `${String(part.value)} ${part.noun}`)),
    mode === "preview" ? "nothing was written" : undefined,
  ]);

export interface OperationDocOptions {
  readonly verbosity: VerbosityLevel;
  readonly message?: string;
  readonly suggestions?: ReadonlyArray<SuggestedAction>;
}

export const operationDoc = (
  resolution: OperationResolution<unknown>,
  options: OperationDocOptions,
): Doc => {
  const outcome = deriveOperationOutcome(resolution);
  if (outcome === "previewed" && resolution.divergence !== true) return [];
  const counts = countUnitStates(resolution.units);
  const presentation = resolution.presentation ?? defaultOperationPresentation;
  const verdict =
    options.message ??
    (outcome === "blocked" && resolution.blocking !== undefined
      ? `${outcomeHeadline(presentation, outcome, counts)} — ${blockingClass(resolution.blocking.class)}`
      : outcome === "failed" && counts.rolledBack > 0
        ? `${outcomeHeadline(presentation, outcome, counts)} — all changes rolled back`
        : outcome === "interrupted" && resolution.interruption !== undefined
          ? interruptionPhrase(resolution.interruption.signal, resolution.interruption.disposition)
          : outcomeHeadline(presentation, outcome, counts));
  const detailed = options.verbosity === "verbose" || options.verbosity === "debug";
  const visible = resolution.units.filter(
    (unit) => detailed || (unit.state !== "unchanged" && unit.state !== "skipped"),
  );
  const coverage = resolutionAgentCoverage(resolution);
  const ledger = foldedLedger(
    ledgerColumns(presentation, "Status"),
    visible.map((unit) => resultRow(unit, detailed)),
    detailed
      ? []
      : foldGroups(presentation, [
          { count: counts.unchanged, state: "unchanged" },
          { count: counts.skipped, state: "skipped" },
        ]),
  );
  const next = [...(options.suggestions ?? []), ...(resolution.recovery?.actions ?? [])];
  const aside = verdictAside(presentation, counts, resolution.mode);

  return [
    // Quiet keeps the outcome and drops the narration around it, so the
    // title line the operation opened with does not survive the filter.
    ...titleLine(presentation, resolution.mode, {
      ledger: ledger.length > 0 && options.verbosity !== "quiet",
      ...(coverage === undefined ? {} : { scope: coverage.scope, agents: coverage.agents }),
    }),
    ...(resolution.failure?.detail === undefined
      ? []
      : [{ _tag: "paragraph", tone: "error", text: resolution.failure.detail } as const]),
    ...(resolution.blocking?.detail === undefined
      ? []
      : [{ _tag: "paragraph", text: resolution.blocking.detail } as const]),
    ...ledger,
    ...groupedWarnings(resolution.units),
    ...untouchedPaths(resolution.units),
    ...(coverage === undefined || coverage.agents.length > 0
      ? []
      : [
          {
            _tag: "callout",
            tone: "warn",
            title: "No coding-agent targets were materialized",
            children: [
              {
                _tag: "paragraph",
                text: `Run \`axm agents add --detected${coverage.scope === "user" ? " --scope user" : ""}\`, then retry.`,
              },
            ],
          } as const,
        ]),
    {
      _tag: "headline",
      tone: headlineTone(outcome),
      text: emphatic(verdict),
      ...(aside.length === 0 ? {} : { aside }),
    },
    ...(next.length === 0 ? [] : [{ _tag: "next", actions: next } as const]),
  ];
};

export const planDoc = (
  plan: Plan<unknown, unknown>,
  options: { readonly mode: "preview" | "apply"; readonly verbosity: VerbosityLevel },
): Doc => {
  const steps = plan.jobs.flatMap((job) => [...job.steps]);
  if (steps.length === 0) return [];
  const presentation = presentationOf(plan);
  const risks = plan.riskConditions ?? [];
  const gated = risks.some((risk) => risk.level === "confirmable");
  if (options.mode === "apply" && !gated) return [];
  const detailed = options.verbosity === "verbose" || options.verbosity === "debug";
  const changing = steps.filter((step) => step.artifact?.change !== "unchanged");
  const unchanged = steps.length - changing.length;
  const warnings = steps.filter((step) => step.readiness === "warn").length + risks.length;
  const errors = steps.filter((step) => step.readiness === "error").length;
  const aside = joined([
    changing.length === 0
      ? undefined
      : `${String(changing.length)} to ${presentation.verb.imperative}`,
    unchanged === 0 ? undefined : `${String(unchanged)} ${unitState("unchanged")}`,
    warnings === 0 ? undefined : count(warnings, "warning"),
    errors === 0 ? undefined : count(errors, "error"),
    options.mode === "preview" ? "nothing was written" : undefined,
  ]);
  const scope = steps.find((step) => step.artifact !== undefined)?.artifact?.scope;
  const agents = [
    ...new Set(
      steps.flatMap((step) =>
        (step.artifact?.agents ?? []).filter((agent) => agent !== "universal"),
      ),
    ),
  ];
  const ledger =
    options.verbosity === "quiet"
      ? []
      : foldedLedger(
          ledgerColumns(presentation, "Plan"),
          (detailed ? steps : changing).map((step) => planRow(step, presentation, detailed)),
          detailed ? [] : foldGroups(presentation, [{ count: unchanged, state: "unchanged" }]),
        );

  return [
    ...titleLine(presentation, options.mode, {
      ledger: ledger.length > 0,
      ...(scope === undefined ? {} : { scope }),
      ...(agents.length === 0 ? {} : { agents }),
    }),
    ...Option.match(plan.description, {
      onNone: (): Doc => [],
      onSome: (description): Doc => [{ _tag: "paragraph", text: description }],
    }),
    ...ledger,
    ...risks.map((risk) => ({ _tag: "callout", tone: "warn", title: risk.detail }) as const),
    {
      _tag: "headline",
      tone: "neutral",
      text: emphatic(planVerdict(presentation, options.mode, changing.length)),
      ...(aside.length === 0 ? {} : { aside }),
    },
    // Where no gate opens there is nothing to answer, so the hint is the only
    // way a reader learns the details are one flag away.
    ...(gated || detailed || unchanged > 0
      ? []
      : [{ _tag: "paragraph", tone: "dim", text: "--verbose for details" } as const]),
  ];
};

/** Paint the planning-time orientation through the application-owned screen. */
export const presentPlan = (
  plan: Plan<unknown, unknown>,
  options?: { readonly mode?: "preview" | "apply" },
) =>
  Effect.gen(function* () {
    const screen = yield* Screen;
    const verbosity = yield* Verbosity;
    const doc = planDoc(plan, {
      mode: options?.mode ?? "preview",
      verbosity: verbosity.level,
    });
    if (doc.length > 0) yield* screen.note(doc);
  });
