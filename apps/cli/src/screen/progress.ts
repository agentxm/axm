/**
 * Progress state — the pure projection of an operation's lifecycle events.
 *
 * One projector folds the event stream into this state; the live frame reads
 * the latest state and never consumes raw events. The fold is a pure
 * function, so it is deterministic over a recorded event log and independent
 * of terminal width, mode, or renderer.
 */

import type {
  BlockingClass,
  OperationEvent,
  OperationMode,
  OperationPhase,
  ProgressUnit,
  SettledOutcome,
  UnitState,
} from "@agentxm/workspace-operations";

export interface ProgressMeasure {
  readonly done: number;
  readonly total?: number;
  readonly unit: ProgressUnit;
}

export interface ProgressTask {
  readonly id: string;
  readonly label: string;
  readonly parentId?: string;
  readonly index: number;
  readonly total?: number;
  readonly status: "running" | UnitState;
  readonly startedAtMs: number;
  readonly settledAtMs?: number;
  readonly measure?: ProgressMeasure;
}

export interface ProgressWait {
  readonly blockingClass: BlockingClass;
  readonly subject: string;
  readonly detail: string;
  readonly sinceMs: number;
}

export interface ProgressOperation {
  readonly id: string;
  readonly name: string;
  readonly mode: OperationMode;
  readonly startedAtMs: number;
}

export interface ProgressSettlement {
  readonly outcome: SettledOutcome;
  readonly atMs: number;
}

export interface ProgressState {
  readonly operation?: ProgressOperation;
  readonly phase?: OperationPhase;
  /** Every observed unit in start order, running and settled alike. */
  readonly tasks: ReadonlyArray<ProgressTask>;
  /** Open waits, one per subject. */
  readonly waiting: ReadonlyArray<ProgressWait>;
  readonly settled?: ProgressSettlement;
  /** Sequence number of the last folded event; 0 before any event. */
  readonly lastSeq: number;
}

export const initialProgress: ProgressState = { tasks: [], waiting: [], lastSeq: 0 };

const replaceTask = (
  tasks: ReadonlyArray<ProgressTask>,
  id: string,
  update: (task: ProgressTask) => ProgressTask,
): ReadonlyArray<ProgressTask> => tasks.map((task) => (task.id === id ? update(task) : task));

/** Fold one event into the state. Pure; unknown units are admitted as observed. */
export const reduceProgress = (state: ProgressState, event: OperationEvent): ProgressState => {
  const lastSeq = Math.max(state.lastSeq, event.seq);
  switch (event._tag) {
    case "OperationStarted":
      return {
        ...state,
        lastSeq,
        operation: {
          id: event.operationId,
          name: event.name,
          mode: event.mode,
          startedAtMs: event.atMs,
        },
      };
    case "PhaseStarted":
      return { ...state, lastSeq, phase: event.phase };
    case "UnitStarted": {
      const task: ProgressTask = {
        id: event.unitId,
        label: event.label,
        ...(event.parentUnitId === undefined ? {} : { parentId: event.parentUnitId }),
        index: event.index,
        ...(event.total === undefined ? {} : { total: event.total }),
        status: "running",
        startedAtMs: event.atMs,
      };
      const known = state.tasks.some((candidate) => candidate.id === event.unitId);
      return {
        ...state,
        lastSeq,
        tasks: known ? replaceTask(state.tasks, event.unitId, () => task) : [...state.tasks, task],
      };
    }
    case "UnitProgress":
      return {
        ...state,
        lastSeq,
        tasks: replaceTask(state.tasks, event.unitId, (task) => ({
          ...task,
          measure: {
            done: event.done,
            ...(event.total === undefined ? {} : { total: event.total }),
            unit: event.unit,
          },
        })),
      };
    case "UnitResolved": {
      const known = state.tasks.some((candidate) => candidate.id === event.unitId);
      const resolved = (task: ProgressTask): ProgressTask => ({
        ...task,
        label: event.label,
        status: event.state,
        settledAtMs: event.atMs,
      });
      return {
        ...state,
        lastSeq,
        tasks: known
          ? replaceTask(state.tasks, event.unitId, resolved)
          : [
              ...state.tasks,
              resolved({
                id: event.unitId,
                label: event.label,
                index: event.index,
                ...(event.total === undefined ? {} : { total: event.total }),
                status: "running",
                startedAtMs: event.atMs,
              }),
            ],
      };
    }
    case "Waiting":
      return {
        ...state,
        lastSeq,
        waiting: [
          ...state.waiting.filter((wait) => wait.subject !== event.subject),
          {
            blockingClass: event.blockingClass,
            subject: event.subject,
            detail: event.detail,
            sinceMs: event.atMs,
          },
        ],
      };
    case "WaitEnded":
      return {
        ...state,
        lastSeq,
        waiting: state.waiting.filter((wait) => wait.subject !== event.subject),
      };
    case "OperationSettled":
      return { ...state, lastSeq, settled: { outcome: event.outcome, atMs: event.atMs } };
  }
};

export const runningTasks = (state: ProgressState): ReadonlyArray<ProgressTask> =>
  state.tasks.filter((task) => task.status === "running");

/**
 * Settled-over-planned counts for the units that declared a planned total;
 * undefined when no unit declared one.
 */
export const plannedProgress = (
  state: ProgressState,
): { readonly settled: number; readonly total: number } | undefined => {
  const planned = state.tasks.filter((task) => task.total !== undefined);
  if (planned.length === 0) return undefined;
  const total = Math.max(...planned.map((task) => task.total ?? 0));
  const settled = planned.filter((task) => task.status !== "running").length;
  return { settled, total };
};

/** Elapsed milliseconds of the operation at `nowMs`, or at settlement. */
export const operationElapsedMs = (state: ProgressState, nowMs?: number): number | undefined => {
  if (state.operation === undefined) return undefined;
  const end = state.settled?.atMs ?? nowMs;
  return end === undefined ? undefined : Math.max(0, end - state.operation.startedAtMs);
};
