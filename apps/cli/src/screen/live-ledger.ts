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
 * Settled rows leave the window and return in the result, so a long plan folds
 * into a count rather than scrolling past the height the scene allows.
 *
 * Every function here is pure: a recorded event log and the space the scene
 * gives decide the document. Wording comes from the phrase layer; the painter
 * owns every glyph.
 */

import type { UnitState } from "@agentxm/workspace/transitions/planning";

import type { Doc, LedgerColumn, LedgerFold, LedgerRow, Mark, Text } from "./doc.js";
import {
  blockingClass,
  duration,
  liveUnitActivity,
  phaseLabel,
  progressMeasure,
  unitState,
  unitStateChange,
} from "./phrases.js";
import {
  operationElapsedMs,
  type ProgressState,
  type ProgressTask,
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
  readonly aside?: Text;
  /** The columns that identify a unit — its name, and any value fixed by the plan. */
  readonly columns: ReadonlyArray<LedgerColumn>;
  readonly rows: ReadonlyArray<LivePlanRow>;
  /** A dim line beneath the ledger, such as the flag that reveals details. */
  readonly hint?: Text;
}

export interface LivePlanRow {
  /** The unit id the plan layer assigned; lifecycle events carry the same one. */
  readonly id: string;
  /** The mark the plan gave the row, which a unit that changed as planned keeps. */
  readonly mark: Mark;
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
  | { readonly _tag: "running"; readonly task: ProgressTask; readonly nested: boolean }
  | { readonly _tag: "paused"; readonly wait: ProgressWait }
  | { readonly _tag: "settled"; readonly state: UnitState };

/** The two columns the live ledger owns, whatever the plan identifies a unit by. */
const STATUS_COLUMN: LedgerColumn = { header: "Status", role: "fixed", priority: "optional" };
const DETAIL_COLUMN: LedgerColumn = { header: "Detail", role: "elastic", priority: "optional" };

/** The columns a synthesized ledger identifies a unit by: its label alone, unheaded. */
const SYNTHESIZED_COLUMNS: ReadonlyArray<LedgerColumn> = [{ header: "", role: "name" }];

/**
 * The units indexed the two ways a join reads them. The live region repaints
 * several times a second over every row, so the index is built once per join
 * rather than searched once per row.
 */
interface TaskIndex {
  readonly byId: ReadonlyMap<string, ProgressTask>;
  readonly byParent: ReadonlyMap<string, ReadonlyArray<ProgressTask>>;
}

const indexTasks = (tasks: ReadonlyArray<ProgressTask>): TaskIndex => {
  const byId = new Map<string, ProgressTask>();
  const byParent = new Map<string, Array<ProgressTask>>();
  for (const task of tasks) {
    byId.set(task.id, task);
    if (task.parentId === undefined) continue;
    const siblings = byParent.get(task.parentId);
    if (siblings === undefined) byParent.set(task.parentId, [task]);
    else siblings.push(task);
  }
  return { byId, byParent };
};

/**
 * Every unit beneath one row, however deep. Producers set `parentUnitId`, so a
 * download and the per-agent projection that follows it both belong to the row
 * that planned the extension. The visited set keeps a malformed chain finite.
 */
const descendants = (index: TaskIndex, id: string): ReadonlyArray<ProgressTask> => {
  const found: Array<ProgressTask> = [];
  const visited = new Set<string>([id]);
  const frontier = [id];
  while (frontier.length > 0) {
    const parent = frontier.pop();
    if (parent === undefined) break;
    for (const task of index.byParent.get(parent) ?? []) {
      if (visited.has(task.id)) continue;
      visited.add(task.id);
      found.push(task);
      frontier.push(task.id);
    }
  }
  return found;
};

/** The innermost work in flight: the running unit that started last. */
const innermostRunning = (tasks: ReadonlyArray<ProgressTask>): ProgressTask | undefined =>
  tasks
    .filter((task) => task.status === "running")
    .reduce<ProgressTask | undefined>(
      (latest, task) =>
        latest === undefined || task.startedAtMs >= latest.startedAtMs ? task : latest,
      undefined,
    );

const activityOf = (state: ProgressState, index: TaskIndex, id: string): Activity => {
  const own = index.byId.get(id);
  const nested = descendants(index, id);
  // A wait names one subject, and an operation holds few of them at once.
  const wait = state.waiting.find(
    (open) => open.subject === id || nested.some((task) => task.id === open.subject),
  );
  if (wait !== undefined) return { _tag: "paused", wait };
  const running = innermostRunning(own === undefined ? nested : [own, ...nested]);
  if (running !== undefined) {
    return { _tag: "running", task: running, nested: running.id !== id };
  }
  if (own === undefined || own.status === "running") return { _tag: "waiting" };
  return { _tag: "settled", state: own.status };
};

/**
 * The mark a row carries. A unit that settled as its plan described keeps the
 * plan's own mark, because what changed is what was planned; any other
 * settlement carries the mark of the state it reached.
 */
const markOf = (activity: Activity, planned: Mark | undefined): Mark => {
  switch (activity._tag) {
    case "waiting":
      return "waiting";
    case "running":
      return "working";
    case "paused":
      return "warn";
    case "settled":
      return activity.state === "committed" && planned !== undefined
        ? planned
        : unitStateChange(activity.state);
  }
};

/**
 * What a row says it is doing. A running row names the nested unit in flight
 * when there is one — a download, then the per-agent projection — and falls
 * back to the operation's phase.
 */
const statusOf = (activity: Activity, state: ProgressState): Text => {
  switch (activity._tag) {
    case "waiting":
      return liveUnitActivity("waiting");
    case "paused":
      return liveUnitActivity("paused");
    case "settled":
      return unitState(activity.state);
    case "running":
      return activity.nested
        ? activity.task.label
        : state.phase === undefined
          ? liveUnitActivity("running")
          : phaseLabel(state.phase);
  }
};

/** What a row shows beyond its state: how far a running unit has come, or why it is parked. */
const detailOf = (activity: Activity): Text => {
  switch (activity._tag) {
    case "running":
      return activity.task.measure === undefined ? "" : progressMeasure(activity.task.measure);
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
  /** `active` is running or paused, `pending` has not started, `settled` is done. */
  readonly place: "active" | "pending" | "settled";
}

const placeOf = (activity: Activity): LiveRow["place"] => {
  switch (activity._tag) {
    case "running":
    case "paused":
      return "active";
    case "waiting":
      return "pending";
    case "settled":
      return "settled";
  }
};

const joinRow = (
  state: ProgressState,
  index: TaskIndex,
  planned: {
    readonly id: string;
    readonly mark?: Mark;
    readonly cells: ReadonlyArray<Text>;
    readonly depth?: number;
  },
): LiveRow => {
  const activity = activityOf(state, index, planned.id);
  return {
    place: placeOf(activity),
    row: {
      id: planned.id,
      mark: markOf(activity, planned.mark),
      cells: [...planned.cells, statusOf(activity, state), detailOf(activity)],
      ...(planned.depth === undefined ? {} : { depth: planned.depth }),
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
  const index = indexTasks(state.tasks);
  return plan === undefined
    ? state.tasks
        .filter((task) => task.parentId === undefined)
        .map((task) => joinRow(state, index, { id: task.id, cells: [task.label] }))
    : plan.rows.map((row) => joinRow(state, index, row));
};

/**
 * The rows the window shows and the line that stands for the rest: work in
 * flight first, then the units waiting their turn, and never a settled row —
 * those have said what they had to say and return in the result ledger.
 */
export const liveWindow = (
  rows: ReadonlyArray<LiveRow>,
  budget: number,
): { readonly rows: ReadonlyArray<LedgerRow>; readonly folded?: LedgerFold } => {
  const visible = [
    ...rows.filter((row) => row.place === "active"),
    ...rows.filter((row) => row.place === "pending"),
  ];
  const settled = rows.length - visible.length;
  if (budget <= 0) return { rows: [] };
  if (visible.length <= budget) return { rows: visible.map((row) => row.row) };
  // The fold line takes one of the window's rows, so it never replaces a
  // single row it would otherwise have shown.
  const shown = visible.slice(0, budget - 1);
  const folded = visible.slice(shown.length);
  const pending = folded.filter((row) => row.place === "pending").length;
  return {
    rows: shown.map((row) => row.row),
    folded: {
      mark: "waiting",
      count: folded.length,
      noun: pending === folded.length ? "more waiting" : "more",
      ...(settled === 0 ? {} : { hint: `${String(settled)} done` }),
    },
  };
};

/** What the operation is doing, how far it has come, and how long it has taken. */
const statusLine = (state: ProgressState, rows: ReadonlyArray<LiveRow>, nowMs: number): Text => {
  const activity =
    state.phase === undefined ? (state.operation?.name ?? "") : phaseLabel(state.phase);
  const started = rows.filter((row) => row.place !== "pending").length;
  const elapsed = operationElapsedMs(state, nowMs);
  const progress =
    rows.length === 0 ? activity : `${activity} ${String(started)} of ${String(rows.length)}`;
  return elapsed === undefined ? progress : `${progress} in ${duration(elapsed)}`;
};

/** Rows the part spends on everything that is not a ledger row or its fold line. */
const fixedRows = (plan: LivePlan | undefined, headed: boolean): number =>
  // Title, the blank under it, the header, the blank above the status line,
  // the status line, and the hint when the plan carries one.
  2 + (headed ? 1 : 0) + 2 + (plan?.hint === undefined ? 0 : 1);

/**
 * The live region's ledger: the operation's title, the window of rows the
 * height allows, and the line that says how far it has come. Empty before the
 * operation starts and once it has settled, because the result ledger says
 * everything that is left to say.
 */
export const liveLedgerDoc = (state: ProgressState, options: LiveLedgerOptions): Doc => {
  if (state.operation === undefined || state.settled !== undefined) return [];
  const plan = options.plan;
  const rows = joinLiveRows(state, plan);
  const columns = [...(plan?.columns ?? SYNTHESIZED_COLUMNS), STATUS_COLUMN, DETAIL_COLUMN];
  const headed = columns.some((column) => column.header !== "");
  const window = liveWindow(rows, options.rows - fixedRows(plan, headed));
  const title = plan?.title ?? state.operation.name;
  const aside = plan?.aside;
  return [
    {
      _tag: "headline",
      tone: "neutral",
      text: typeof title === "string" ? [{ text: title, bold: true }] : title,
      ...(aside === undefined ? {} : { aside }),
    },
    { _tag: "blank" },
    ...(window.rows.length === 0 && window.folded === undefined
      ? []
      : [
          {
            _tag: "ledger",
            columns,
            rows: window.rows,
            ...(window.folded === undefined ? {} : { folded: window.folded }),
          } as const,
          { _tag: "blank" } as const,
        ]),
    { _tag: "paragraph", tone: "dim", text: statusLine(state, rows, options.nowMs) },
    ...(plan?.hint === undefined
      ? []
      : [{ _tag: "paragraph", tone: "dim", text: plan.hint } as const]),
  ];
};
