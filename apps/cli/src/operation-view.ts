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
} from "@agentxm/workspace/transitions/planning";

import { Verbosity, type VerbosityLevel } from "./cli-flags/index.js";
import type { Doc, LedgerColumn, LedgerFold, LedgerRow, Span, Text, Tone } from "./screen/doc.js";
import { factParts } from "./screen/docs.js";
import type { LivePlan } from "./screen/live-ledger.js";
import { Screen } from "./screen/screen.js";
import { operationExitCode } from "./operation-exit-code.js";
import {
  INTERRUPTED_IN_FLIGHT,
  NOT_TRIED,
  agentOutcome,
  artifactChange,
  artifactChangeMark,
  blockingClass,
  count,
  disposition,
  exitPhrase,
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
const NO_VERSION = "-";

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

/**
 * The columns a live ledger identifies a unit by. Every one of them is
 * optional, because the live region's values are transient and the result
 * ledger carries them: under width pressure a running row gives up its version
 * before its name, so the marks and the names survive a narrow terminal.
 */
const liveColumns = (presentation: OperationPresentation): ReadonlyArray<LedgerColumn> => [
  { header: subjectHeader(presentation), role: "name" },
  { header: "Version", role: "fixed", priority: "optional" },
];

const cellOf = (row: LedgerRow, index: number): Text => row.cells[index] ?? "";

/**
 * A pack's members as a ledger of their own beneath the pack's row. It needs
 * no header, because the pack's row already says what the change is.
 */
const MEMBER_COLUMNS: ReadonlyArray<LedgerColumn> = [
  { header: "", role: "name" },
  { header: "", role: "fixed", priority: "required" },
];

const membershipChildren = (artifact: JobStepArtifact | undefined): Doc => {
  if (artifact?.packMembership === undefined) return [];
  return [
    {
      _tag: "ledger",
      columns: MEMBER_COLUMNS,
      rows: artifact.packMembership.members.map((member) => ({
        mark: member.before === null ? "create" : member.after === null ? "remove" : "update",
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

/**
 * How a unit settled, as its result row reads: the change it made as planned,
 * a state of its own, or — for a unit the operation stopped before — never
 * tried. A unit still in flight when a restoring operation stopped reads as
 * rolled back, because that is what became of it.
 */
type Settlement =
  | { readonly _tag: "changed"; readonly artifact: JobStepArtifact }
  | { readonly _tag: "not-tried" }
  | { readonly _tag: "rolled-back-in-flight" }
  | { readonly _tag: "state"; readonly state: UnitState };

/** States whose unit did not settle as planned, so its message is the reason why. */
const UNSETTLED: ReadonlySet<UnitState> = new Set(["failed", "blocked", "interrupted"]);

const settlementOf = (
  unit: ResolvedUnit<unknown>,
  mode: OperationResolution<unknown>["mode"],
): Settlement => {
  if (unit.state === "committed" && unit.artifact !== undefined) {
    return { _tag: "changed", artifact: unit.artifact };
  }
  // A unit an applying operation settled without running — it stopped, was
  // blocked, or was declined first — or one the interruption stopped before.
  if (
    (mode === "apply" && (unit.state === "planned" || unit.state === "ready")) ||
    (unit.state === "blocked" && unit.blocking?.class === "operation-aborted")
  ) {
    return { _tag: "not-tried" };
  }
  if (unit.state === "interrupted" && unit.disposition === "restored") {
    return { _tag: "rolled-back-in-flight" };
  }
  return { _tag: "state", state: unit.state };
};

const resultRow = (
  unit: ResolvedUnit<unknown>,
  mode: OperationResolution<unknown>["mode"],
  detailed: boolean,
): LedgerRow => {
  const settlement = settlementOf(unit, mode);
  const name = unit.artifact?.packMembership?.pack ?? unit.label;
  const version = versionCell(unit.artifact);
  const row = ((): LedgerRow => {
    switch (settlement._tag) {
      case "changed":
        return {
          mark: artifactChangeMark(settlement.artifact.change),
          // An artifact's change already says what happened, so its own
          // message would only repeat the status column.
          cells: [
            name,
            version,
            artifactChange(settlement.artifact.change),
            detailCell(settlement.artifact, [
              unit.disposition === undefined ? undefined : disposition(unit.disposition),
            ]),
          ],
        };
      case "not-tried":
        // Nothing happened to it, so there is nothing to detail.
        return { mark: "not-tried", cells: [name, version, NOT_TRIED, ""] };
      case "rolled-back-in-flight":
        return {
          mark: "rolled-back",
          cells: [name, version, unitState("rolled-back"), INTERRUPTED_IN_FLIGHT],
        };
      case "state":
        return {
          mark: unitStateChange(settlement.state),
          cells: [
            name,
            version,
            unitState(settlement.state),
            detailCell(unit.artifact, [
              // A unit that did not settle as planned says why in its own
              // message; any other unit's message restates its status.
              unit.artifact === undefined || UNSETTLED.has(settlement.state)
                ? unit.message
                : undefined,
              unit.disposition === undefined ? undefined : disposition(unit.disposition),
            ]),
          ],
        };
    }
  })();
  return withChildren({ id: unitIdOf(unit), ...row }, rowChildren(unit, detailed));
};

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
          : step.artifact.change === "created" && presentation.verb.create !== undefined
            ? presentation.verb.create
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

/** Where no gate opens, the only place a reader learns the details are one flag away. */
const DETAIL_HINT = "--verbose for details";

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
 * Each group folds into a line of its own, so neither the already-current nor
 * the not-selected count is lost.
 */
const foldedLedger = (
  columns: ReadonlyArray<LedgerColumn>,
  rows: ReadonlyArray<LedgerRow>,
  folds: ReadonlyArray<FoldGroup>,
): Doc => {
  if (rows.length === 0 && folds.length === 0) return [];
  return [
    {
      _tag: "ledger",
      columns,
      rows,
      ...(folds.length === 0
        ? {}
        : {
            folds: folds.map((fold): LedgerFold => ({
              mark: "unchanged",
              ...fold,
              hint: FOLD_HINT,
            })),
          }),
    },
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
  const aside = factParts([
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

/** The word a result row's status column says for a unit, whatever its settlement. */
const statusWord = (settlement: Settlement): string => {
  switch (settlement._tag) {
    case "changed":
      return unitState("committed");
    case "not-tried":
      return NOT_TRIED;
    case "rolled-back-in-flight":
      return unitState("rolled-back");
    case "state":
      return unitState(settlement.state);
  }
};

/** The settlements a verdict's aside counts, in the order it names them. */
const TALLIED: ReadonlyArray<string> = [
  unitState("committed"),
  unitState("failed"),
  unitState("blocked"),
  unitState("rolled-back"),
  NOT_TRIED,
  unitState("unchanged"),
  unitState("skipped"),
  unitState("planned"),
  unitState("ready"),
  unitState("cancelled"),
  unitState("interrupted"),
];

/**
 * The counts a verdict carries as its aside — how much, never what happened
 * — tallied the way the rows read, so a unit the operation stopped before
 * counts as not tried rather than blocked. An outcome that exits non-zero
 * adds the exit code a script will see.
 */
const verdictAside = (
  units: ReadonlyArray<ResolvedUnit<unknown>>,
  mode: "preview" | "apply",
  exitCode: number,
): ReadonlyArray<string> => {
  const words = units.map((unit) => statusWord(settlementOf(unit, mode)));
  return [
    ...TALLIED.map((word) => {
      const value = words.filter((candidate) => candidate === word).length;
      return value === 0 ? undefined : `${String(value)} ${word}`;
    }),
    mode === "preview" ? "nothing was written" : undefined,
    exitCode === 0 ? undefined : exitPhrase(exitCode),
  ].filter((part): part is string => part !== undefined);
};

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
      ? `${outcomeHeadline(presentation, outcome, counts)} - ${blockingClass(resolution.blocking.class)}`
      : outcome === "failed" && counts.rolledBack > 0
        ? `${outcomeHeadline(presentation, outcome, counts)} - all changes rolled back`
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
    visible.map((unit) => resultRow(unit, resolution.mode, detailed)),
    detailed
      ? []
      : foldGroups(presentation, [
          { count: counts.unchanged, state: "unchanged" },
          { count: counts.skipped, state: "skipped" },
        ]),
  );
  const next = [...(options.suggestions ?? []), ...(resolution.recovery?.actions ?? [])];
  const aside = verdictAside(
    resolution.units,
    resolution.mode,
    operationExitCode(resolution, outcome),
  );

  return [
    // Quiet keeps the outcome and drops the narration around it, so the
    // title line the operation opened with does not survive the filter.
    ...titleLine(presentation, resolution.mode, {
      ledger: ledger.length > 0 && options.verbosity !== "quiet",
      ...(coverage === undefined ? {} : { scope: coverage.scope, agents: coverage.agents }),
    }),
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
    ...verdictDoc({
      ledger: ledger.length > 0,
      tone: headlineTone(outcome),
      verdict,
      aside,
      // A blocked operation stopped on a condition a person must resolve, so
      // its reason stands with its verdict; a failure's reason follows it.
      ...(resolution.blocking === undefined
        ? resolution.failure?.detail === undefined
          ? {}
          : { reason: resolution.failure.detail }
        : { reason: resolution.blocking.detail, blocked: true }),
    }),
    ...(next.length === 0 ? [] : [{ _tag: "next", actions: next } as const]),
  ];
};

/**
 * The verdict and, when the outcome has one, its reason. A verdict after a
 * ledger is a bold toned line whose rows already carry their marks. A blocked
 * operation is waiting on a person, so its verdict is a callout that keeps its
 * attention mark and carries the reason beneath it, and the recoveries that
 * follow answer it; a problem with no ledger above it takes the same shape.
 */
export const verdictDoc = (verdict: {
  readonly ledger: boolean;
  readonly tone: Tone;
  readonly verdict: string;
  readonly aside: ReadonlyArray<string>;
  readonly reason?: string;
  readonly blocked?: true;
}): Doc => {
  if (verdict.blocked === true || (!verdict.ledger && verdict.reason !== undefined)) {
    return [
      {
        _tag: "callout",
        tone: verdict.tone,
        title: emphatic(verdict.verdict),
        ...(verdict.aside.length === 0 ? {} : { aside: joined(verdict.aside) }),
        ...(verdict.reason === undefined
          ? {}
          : { children: [{ _tag: "paragraph", text: verdict.reason }] }),
      },
    ];
  }
  return [
    {
      _tag: "headline",
      tone: verdict.tone,
      text: emphatic(verdict.verdict),
      ...(verdict.ledger ? { verdict: true } : {}),
      ...(verdict.aside.length === 0 ? {} : { aside: factParts(verdict.aside) }),
    },
    ...(verdict.reason === undefined ? [] : [{ _tag: "paragraph", text: verdict.reason } as const]),
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
  const plannedChanges = steps.filter((step) => step.artifact?.change !== "unchanged");
  const changing = plannedChanges.filter((step) => step.readiness !== "error");
  const unchanged = steps.filter((step) => step.artifact?.change === "unchanged").length;
  const warnings = steps.filter((step) => step.readiness === "warn").length + risks.length;
  const errors = steps.filter((step) => step.readiness === "error").length;
  const aside = factParts([
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
          (detailed ? steps : plannedChanges).map((step) => planRow(step, presentation, detailed)),
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
      verdict: true,
      text: emphatic(planVerdict(presentation, options.mode, changing.length)),
      ...(aside.length === 0 ? {} : { aside }),
    },
    // Where no gate opens there is nothing to answer, so the hint is the only
    // way a reader learns the details are one flag away.
    ...(gated || detailed || unchanged > 0
      ? []
      : [{ _tag: "paragraph", tone: "dim", text: DETAIL_HINT } as const]),
  ];
};

/**
 * The plan as the live ledger will carry it: the same title and the same rows
 * the plan showed, identified by the unit ids lifecycle events use, so the
 * region streams the rows it previewed instead of an unrelated tree. The
 * ledger's own two columns — what a unit is doing and how far it has come —
 * are added by the live ledger, which is the only thing that changes while an
 * operation runs.
 */
export const livePlan = (
  plan: Plan<unknown, unknown>,
  options: { readonly verbosity: VerbosityLevel },
): LivePlan | undefined => {
  const steps = plan.jobs.flatMap((job) => [...job.steps]);
  const presentation = presentationOf(plan);
  const detailed = options.verbosity === "verbose" || options.verbosity === "debug";
  // A unit that is already current has nothing to run, so it never reaches the
  // live region; the verdict and the result ledger account for it.
  const running = steps.filter(
    (step) => step.artifact?.change !== "unchanged" && step.readiness !== "error",
  );
  if (running.length === 0) return undefined;
  const scope = steps.find((step) => step.artifact !== undefined)?.artifact?.scope;
  const agents = [
    ...new Set(
      steps.flatMap((step) =>
        (step.artifact?.agents ?? []).filter((agent) => agent !== "universal"),
      ),
    ),
  ];
  const aside = factParts([
    scope === undefined ? undefined : scopePhrase(scope),
    agents.length === 0 ? undefined : `agents: ${agents.join(", ")}`,
  ]);
  const unchanged = steps.length - running.length;
  const risks = plan.riskConditions ?? [];
  return {
    title: operationTitle(presentation, "apply"),
    ...(aside.length === 0 ? {} : { aside }),
    columns: liveColumns(presentation),
    rows: running.map((step) => {
      // Children are the settled document's business; a live row carries the
      // unit's mark and the cells that identify it, and nothing else.
      const row = planRow(step, presentation, false);
      return {
        id: unitIdOf(step),
        plannedMark: row.mark ?? "waiting",
        plannedStatus: cellOf(row, 2),
        cells: [cellOf(row, 0), cellOf(row, 1)],
      };
    }),
    ...(detailed || unchanged === 0
      ? {}
      : {
          folds: foldGroups(presentation, [{ count: unchanged, state: "unchanged" }]).map(
            (fold): LedgerFold => ({ mark: "unchanged", ...fold, hint: FOLD_HINT }),
          ),
        }),
    ...(risks.length === 0
      ? {}
      : {
          attention: risks.map(
            (risk) => ({ _tag: "callout", tone: "warn", title: risk.detail }) as const,
          ),
        }),
    verdict: planVerdict(presentation, "apply", running.length),
    // Where no gate opens this is the only place a reader learns the details
    // are one flag away.
    ...(detailed ? {} : { hint: DETAIL_HINT }),
  };
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
