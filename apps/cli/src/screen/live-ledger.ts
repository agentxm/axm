/**
 * The live ledger — the plan's rows joined to lifecycle progress.
 *
 * One ledger previews, streams, and settles. The rows a plan showed are the
 * rows the live region paints while the operation runs, joined to projected
 * progress by unit id: a row moves from its plan mark to the running mark and
 * on to its final mark, nested units roll up into the row that planned them,
 * and a wait whose subject is a unit pauses that row. An operation with no
 * plan, such as sign-in or upgrade, synthesizes its rows from the units it
 * reports.
 *
 * A row settles in place: it takes its final mark and the word the result will
 * give it, and stays while the rows fit the height the scene allows. Under
 * pressure the window keeps what a reader still needs — the work in flight,
 * everything that did not settle as planned, the next few waiting — and folds
 * the rest into a count rather than scrolling past the height.
 *
 * Every function here is pure: a recorded event log and the space the scene
 * gives decide the document. Wording comes from the phrase layer; the painter
 * owns every glyph.
 */

import type { UnitState } from "@agentxm/workspace/transitions/planning";

import type { Doc, LedgerColumn, LedgerFold, LedgerRow, Mark, SummaryPart, Text } from "./doc.js";
import {
  blockingClass,
  duration,
  liveUnitActivity,
  phaseLabel,
  progressMeasure,
  retryAttempt,
  systemWaitHint,
  systemWaitStatus,
  unitState,
  unitStateChange,
} from "./phrases.js";
import { joined } from "./presenter-helpers.js";
import {
  operationElapsedMs,
  type ProgressState,
  type ProgressUnitState,
  type ProgressWait,
} from "./progress.js";

/**
 * What a plan contributes to its live ledger: the identity of each unit, as
 * the plan ledger showed it. The live ledger appends the two columns that
 * change while an operation runs, so plan, progress, and result differ only
 * in their final columns.
 */
export interface LivePlan {
  /** The title line the plan opened with, repainted above the live rows. */
  readonly title: Text;
  readonly aside?: ReadonlyArray<SummaryPart>;
  /** The columns that identify a unit — its name, and any value fixed by the plan. */
  readonly columns: ReadonlyArray<LedgerColumn>;
  readonly rows: ReadonlyArray<LivePlanRow>;
  /** Rows omitted from the live window because they have no work to run. */
  readonly folds?: ReadonlyArray<LedgerFold>;
  /** Planning-time warnings that must remain visible at the gate. */
  readonly attention?: Doc;
  /** The plan verdict shown before lifecycle progress starts. */
  readonly verdict?: Text;
  /** A dim line beneath the ledger, such as the flag that reveals details. */
  readonly hint?: Text;
}

export interface LivePlanRow {
  /** The unit id the plan layer assigned; lifecycle events carry the same one. */
  readonly id: string;
  /** The mark the plan gave the row, which a unit that changed as planned keeps. */
  readonly plannedMark: Mark;
  /** The planning word kept until the unit starts. */
  readonly plannedStatus: Text;
  /**
   * The word the row says once it settles as its plan described — the same
   * word the result ledger gives it, so a reader is not told one thing while
   * the operation runs and another when it ends.
   */
  readonly settledStatus?: Text;
  /** One cell per identifying column. */
  readonly cells: ReadonlyArray<Text>;
  readonly depth?: number;
}

export interface LiveLedgerOptions {
  readonly plan?: LivePlan;
  /** Rows the whole ledger part may use, from the scene's height budget. */
  readonly rows: number;
  /** Wall clock for the elapsed time on the status line. */
  readonly nowMs: number;
}

/** What a row is doing right now, which decides its mark, its word, and its place. */
type Activity =
  | { readonly _tag: "waiting" }
  | { readonly _tag: "running"; readonly unit: ProgressUnitState; readonly nested: boolean }
  | { readonly _tag: "paused"; readonly wait: ProgressWait }
  | { readonly _tag: "settled"; readonly unit: ProgressUnitState; readonly state: UnitState };

/** How many rows that have not started the window keeps before anything else. */
const PENDING_AHEAD = 2;

/**
 * The lines one row spends: its own, and one more for the reason a row that
 * did not settle as planned carries. The window counts lines rather than rows,
 * because the scene's budget is a height and a reason takes a line of it.
 */
const rowHeight = (row: LiveRow): number => (row.row.reason === undefined ? 1 : 2);

/** The two columns the live ledger owns, whatever the plan identifies a unit by. */
const STATUS_COLUMN: LedgerColumn = { header: "Status", role: "fixed" };
const DETAIL_COLUMN: LedgerColumn = { header: "Detail", role: "elastic", priority: "optional" };

/** The columns a synthesized ledger identifies a unit by: its label alone, unheaded. */
const SYNTHESIZED_COLUMNS: ReadonlyArray<LedgerColumn> = [{ header: "", role: "name" }];

/**
 * The units indexed the two ways a join reads them. The live region repaints
 * several times a second over every row, so the index is built once per join
 * rather than searched once per row.
 */
interface UnitIndex {
  readonly byId: ReadonlyMap<string, ProgressUnitState>;
  readonly byParent: ReadonlyMap<string, ReadonlyArray<ProgressUnitState>>;
}

const indexUnits = (units: ReadonlyArray<ProgressUnitState>): UnitIndex => {
  const byId = new Map<string, ProgressUnitState>();
  const byParent = new Map<string, Array<ProgressUnitState>>();
  for (const unit of units) {
    byId.set(unit.id, unit);
    if (unit.parentId === undefined) continue;
    const siblings = byParent.get(unit.parentId);
    if (siblings === undefined) byParent.set(unit.parentId, [unit]);
    else siblings.push(unit);
  }
  return { byId, byParent };
};

/**
 * Every unit beneath one row, however deep. Producers set `parentUnitId`, so a
 * download and the per-agent projection that follows it both belong to the row
 * that planned the extension. The visited set keeps a malformed chain finite.
 */
const descendants = (index: UnitIndex, id: string): ReadonlyArray<ProgressUnitState> => {
  const found: Array<ProgressUnitState> = [];
  const visited = new Set<string>([id]);
  const frontier = [id];
  while (frontier.length > 0) {
    const parent = frontier.pop();
    if (parent === undefined) break;
    for (const unit of index.byParent.get(parent) ?? []) {
      if (visited.has(unit.id)) continue;
      visited.add(unit.id);
      found.push(unit);
      frontier.push(unit.id);
    }
  }
  return found;
};

/** The innermost work in flight: the running unit that started last. */
const innermostRunning = (units: ReadonlyArray<ProgressUnitState>): ProgressUnitState | undefined =>
  units
    .filter((unit) => unit.status === "running")
    .reduce<ProgressUnitState | undefined>(
      (latest, unit) =>
        latest === undefined || unit.startedAtMs >= latest.startedAtMs ? unit : latest,
      undefined,
    );

const activityOf = (state: ProgressState, index: UnitIndex, id: string): Activity => {
  const own = index.byId.get(id);
  const nested = descendants(index, id);
  // A wait names one subject, and an operation holds few of them at once.
  const wait = state.waiting.find(
    (open) => open.subject === id || nested.some((unit) => unit.id === open.subject),
  );
  if (wait !== undefined) return { _tag: "paused", wait };
  const running = innermostRunning(own === undefined ? nested : [own, ...nested]);
  if (running !== undefined) {
    return { _tag: "running", unit: running, nested: running.id !== id };
  }
  if (own === undefined || own.status === "running") return { _tag: "waiting" };
  return { _tag: "settled", unit: own, state: own.status };
};

/**
 * The mark a row carries. A unit that settled as its plan described keeps the
 * plan's own mark, because what changed is what was planned; any other
 * settlement carries the mark of the state it reached.
 */
const markOf = (activity: Exclude<Activity, { readonly _tag: "settled" }>): Mark => {
  switch (activity._tag) {
    case "waiting":
      // A row that has not started takes the waiting mark and keeps its
      // planned word; the change mark arrives when the unit settles, so the
      // two are never one letter apart.
      return "waiting";
    case "running":
      return "working";
    case "paused":
      return "warn";
  }
};

/**
 * What a row says it is doing. A running row names the nested unit in flight
 * when there is one — a download, then the per-agent projection — and falls
 * back to the operation's phase.
 */
const statusOf = (
  activity: Exclude<Activity, { readonly _tag: "settled" }>,
  state: ProgressState,
  planned: Text,
): Text => {
  switch (activity._tag) {
    case "waiting":
      return planned;
    case "paused":
      return liveUnitActivity("paused");
    case "running":
      return activity.nested
        ? activity.unit.label
        : state.phase === undefined
          ? liveUnitActivity("running")
          : phaseLabel(state.phase);
  }
};

/**
 * What a row shows beyond its state: which attempt a retrying unit is on, how
 * far a running unit has come, or why it is parked. A retry displaces the
 * measurement, because an attempt that restarts counts the same bytes again
 * and the attempt is what explains the wait.
 */
const detailOf = (activity: Activity): Text => {
  switch (activity._tag) {
    case "running": {
      const retry =
        activity.unit.attempt === undefined ? undefined : retryAttempt(activity.unit.attempt);
      if (retry !== undefined) return retry;
      return activity.unit.measure === undefined ? "" : progressMeasure(activity.unit.measure);
    }
    case "paused":
      return blockingClass(activity.wait.blockingClass);
    case "waiting":
    case "settled":
      return "";
  }
};

/** One row of a live ledger: the line it paints, and where the window puts it. */
export interface LiveRow {
  readonly row: LedgerRow;
  /**
   * `active` is running or paused, `pending` has not started, `settled`
   * finished as its plan described, and `unsettled` finished some other way.
   * The window gives up a settled row before an unsettled one, because what
   * went wrong is what a reader is still waiting to act on.
   */
  readonly place: "active" | "pending" | "settled" | "unsettled";
}

const placeOf = (activity: Activity): LiveRow["place"] => {
  switch (activity._tag) {
    case "running":
    case "paused":
      return "active";
    case "waiting":
      return "pending";
    case "settled":
      return activity.state === "committed" ? "settled" : "unsettled";
  }
};

const joinRow = (
  state: ProgressState,
  index: UnitIndex,
  planned: {
    readonly id: string;
    readonly plannedMark?: Mark;
    readonly plannedStatus?: Text;
    readonly settledStatus?: Text;
    readonly cells: ReadonlyArray<Text>;
    readonly depth?: number;
  },
): LiveRow => {
  const activity = activityOf(state, index, planned.id);
  const depth = planned.depth === undefined ? {} : { depth: planned.depth };
  if (activity._tag === "settled") {
    // A unit that settled as its plan described keeps the plan's own mark and
    // takes the word its result row will use; any other settlement carries
    // the mark and word of the state it reached, and says why while it can.
    const asPlanned = activity.state === "committed";
    const reason = activity.unit.failure?.detail;
    return {
      place: placeOf(activity),
      row: {
        id: planned.id,
        mark: asPlanned ? (planned.plannedMark ?? "waiting") : unitStateChange(activity.state),
        cells: [
          ...planned.cells,
          // A plan states the word its result will use; a synthesized row has
          // no plan, so it says what its state says.
          asPlanned
            ? (planned.settledStatus ?? unitState(activity.state))
            : unitState(activity.state),
          "",
        ],
        ...depth,
        ...(reason === undefined ? {} : { reason }),
      },
    };
  }
  const plannedStatus = planned.plannedStatus ?? liveUnitActivity("waiting");
  return {
    place: placeOf(activity),
    row: {
      id: planned.id,
      mark: markOf(activity),
      cells: [...planned.cells, statusOf(activity, state, plannedStatus), detailOf(activity)],
      ...depth,
    },
  };
};

/**
 * The rows a live ledger holds: the plan's, in plan order, or — where no plan
 * was presented — the units the operation reported, in the order they were
 * first observed. A nested unit never gets a row of its own; it rolls up.
 */
export const joinLiveRows = (
  state: ProgressState,
  plan: LivePlan | undefined,
): ReadonlyArray<LiveRow> => {
  const index = indexUnits(state.units);
  return plan === undefined
    ? state.units
        .filter((unit) => unit.parentId === undefined)
        .map((unit) => joinRow(state, index, { id: unit.id, cells: [unit.label] }))
    : plan.rows.map((row) => joinRow(state, index, row));
};

/**
 * The rows the window shows, in plan order, and the line that stands for the
 * rest. While every row fits, every row stays: what has happened is part of
 * what a reader is reading. When they do not fit, rows leave in one order —
 * settled as planned first, oldest first, then the waiting rows beyond the
 * next few — and a row that did not settle as planned never leaves before one
 * that did, because what went wrong is what a reader has still to act on.
 */
export const liveWindow = (
  rows: ReadonlyArray<LiveRow>,
  budget: number,
): { readonly rows: ReadonlyArray<LedgerRow>; readonly folded?: LedgerFold } => {
  if (budget <= 0) return { rows: [] };
  const height = rows.reduce((sum, row) => sum + rowHeight(row), 0);
  if (height <= budget) return { rows: rows.map((row) => row.row) };
  // The fold line takes one of the window's rows, so it never replaces a
  // single row it would otherwise have shown.
  const limit = Math.max(0, budget - 1);
  const placed = (place: LiveRow["place"]): ReadonlyArray<LiveRow> =>
    rows.filter((row) => row.place === place);
  const kept = new Set<LiveRow>();
  let used = 0;
  /** Keep what fits, and report whether everything did. */
  const keep = (candidates: ReadonlyArray<LiveRow>): boolean => {
    for (const row of candidates) {
      if (kept.has(row)) continue;
      if (used + rowHeight(row) > limit) return false;
      kept.add(row);
      used += rowHeight(row);
    }
    return true;
  };
  // Each group is kept before the next is considered at all, so a row that
  // did not settle as planned never gives up its place to one that did, and a
  // row still to come never gives up its place to one already behind.
  void (
    keep(placed("active")) &&
    keep(placed("unsettled")) &&
    keep(placed("pending").slice(0, PENDING_AHEAD)) &&
    keep(placed("pending")) &&
    keep([...placed("settled")].reverse())
  );
  const shown = rows.filter((row) => kept.has(row));
  const folded = rows.filter((row) => !kept.has(row));
  const waiting = folded.filter((row) => row.place === "pending").length;
  const done = placed("settled").length;
  const failed = placed("unsettled").length;
  const hint = joined([
    done === 0 ? undefined : `${String(done)} done`,
    failed === 0 ? undefined : `${String(failed)} failed`,
  ]);
  return {
    rows: shown.map((row) => row.row),
    folded: {
      mark: "waiting",
      count: folded.length,
      noun: waiting === folded.length ? "more waiting" : "more",
      ...(hint.length === 0 ? {} : { hint }),
    },
  };
};

/**
 * What the operation is doing, how much of it has finished, how much of that
 * did not settle as planned, and how long it has taken. It counts what has
 * finished rather than what has started, so a line reading `13 of 13` is never
 * printed over a unit that is still running.
 */
const statusLine = (state: ProgressState, rows: ReadonlyArray<LiveRow>, nowMs: number): Text => {
  const activity =
    state.phase === undefined ? (state.operation?.name ?? "") : phaseLabel(state.phase);
  const finished = rows.filter(
    (row) => row.place === "settled" || row.place === "unsettled",
  ).length;
  const failed = rows.filter((row) => row.place === "unsettled").length;
  const elapsed = operationElapsedMs(state, nowMs);
  const progress =
    rows.length === 0
      ? activity
      : joined([
          `${activity} ${String(finished)} of ${String(rows.length)} done`,
          failed === 0 ? undefined : `${String(failed)} failed`,
        ]);
  return elapsed === undefined ? progress : `${progress} in ${duration(elapsed)}`;
};

/**
 * Waits that name no unit, such as another operation holding the workspace:
 * the system, not a row, is what the operation is parked on, so they stand
 * beneath the ledger in place of the status line.
 */
const systemWaits = (
  state: ProgressState,
  rows: ReadonlyArray<LiveRow>,
): ReadonlyArray<ProgressWait> => {
  const units = new Set([
    ...state.units.map((unit) => unit.id),
    ...rows.flatMap((row) => (row.row.id === undefined ? [] : [row.row.id])),
  ]);
  return state.waiting.filter((wait) => !units.has(wait.subject));
};

/** One system wait: its status and how long it has lasted, who holds it, and what stopping costs. */
const systemWaitDoc = (wait: ProgressWait, nowMs: number): Doc => {
  const hint = systemWaitHint(wait.blockingClass);
  return [
    {
      _tag: "wait",
      status: systemWaitStatus(wait.blockingClass),
      clock: duration(Math.max(0, nowMs - wait.sinceMs)),
      ...(wait.detail.length === 0 ? {} : { detail: wait.detail }),
      chips: [],
    },
    ...(hint === undefined ? [] : [{ _tag: "paragraph", tone: "dim", text: hint } as const]),
  ];
};

/** Rows what stands beneath the ledger takes: one per line it paints. */
const beneathRows = (doc: Doc): number =>
  doc.reduce((rows, node) => rows + (node._tag === "wait" && node.detail !== undefined ? 2 : 1), 0);

/** Rows the part spends on everything that is not a ledger row or its fold line. */
const fixedRows = (plan: LivePlan | undefined, headed: boolean, beneath: number): number =>
  // Title, the blank under it, the header, the blank above what stands beneath
  // the ledger, what stands there, and the hint when the plan carries one.
  2 +
  (headed ? 1 : 0) +
  1 +
  beneath +
  (plan?.folds?.length ?? 0) +
  (plan?.hint === undefined ? 0 : 1);

/**
 * The live region's ledger: the operation's title, the window of rows the
 * height allows, and the line that says how far it has come. Empty before the
 * operation starts and once it has settled, because the result ledger says
 * everything that is left to say.
 */
export const liveLedgerDoc = (state: ProgressState, options: LiveLedgerOptions): Doc => {
  if ((state.operation === undefined && options.plan === undefined) || state.settled !== undefined)
    return [];
  const plan = options.plan;
  const rows = joinLiveRows(state, plan);
  const columns = [...(plan?.columns ?? SYNTHESIZED_COLUMNS), STATUS_COLUMN, DETAIL_COLUMN];
  const headed = columns.some((column) => column.header !== "");
  const waits = systemWaits(state, rows);
  const progressOrVerdict: Doc =
    state.operation === undefined && plan?.verdict !== undefined
      ? [{ _tag: "paragraph", tone: "dim", text: plan.verdict }]
      : [{ _tag: "paragraph", tone: "dim", text: statusLine(state, rows, options.nowMs) }];
  const beneath: Doc = [
    ...(plan?.attention ?? []),
    ...(waits.length === 0
      ? progressOrVerdict
      : waits.flatMap((wait) => systemWaitDoc(wait, options.nowMs))),
  ];
  const window = liveWindow(rows, options.rows - fixedRows(plan, headed, beneathRows(beneath)));
  const title = plan?.title ?? state.operation?.name ?? "";
  const aside = plan?.aside;
  return [
    {
      _tag: "headline",
      tone: "neutral",
      text: typeof title === "string" ? [{ text: title, bold: true }] : title,
      ...(aside === undefined ? {} : { aside }),
    },
    ...(window.rows.length === 0 && window.folded === undefined && (plan?.folds?.length ?? 0) === 0
      ? []
      : [
          {
            _tag: "ledger",
            columns,
            rows: window.rows,
            ...((plan?.folds?.length ?? 0) === 0 && window.folded === undefined
              ? {}
              : {
                  folds: [
                    ...(window.folded === undefined ? [] : [window.folded]),
                    ...(plan?.folds ?? []),
                  ],
                }),
          } as const,
        ]),
    ...beneath,
    ...(plan?.hint === undefined
      ? []
      : [{ _tag: "paragraph", tone: "dim", text: plan.hint } as const]),
  ];
};
