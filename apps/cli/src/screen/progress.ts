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
  ProgressAttempt,
  ProgressUnit,
  SettledOutcome,
  UnitFailure,
  UnitState,
} from "@agentxm/workspace/transitions/planning";

export interface ProgressMeasure {
  readonly done: number;
  readonly total?: number;
  readonly unit: ProgressUnit;
}

export interface ProgressUnitState {
  readonly id: string;
  readonly label: string;
  readonly parentId?: string;
  readonly index: number;
  readonly total?: number;
  readonly status: "running" | UnitState;
  readonly startedAtMs: number;
  readonly phase?: OperationPhase;
  readonly settledAtMs?: number;
  readonly measure?: ProgressMeasure;
  /** The attempt in flight, present only while a producer is retrying the unit. */
  readonly attempt?: ProgressAttempt;
  /**
   * Why the unit did not settle as planned, where its producer stated one, so
   * a live row can say why without waiting for the result document.
   */
  readonly failure?: UnitFailure;
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
  readonly units: ReadonlyArray<ProgressUnitState>;
  /** Open waits, one per subject. */
  readonly waiting: ReadonlyArray<ProgressWait>;
  readonly settled?: ProgressSettlement;
  /** Sequence number of the last folded event; 0 before any event. */
  readonly lastSeq: number;
}

export const initialProgress: ProgressState = { units: [], waiting: [], lastSeq: 0 };

const replaceUnit = (
  units: ReadonlyArray<ProgressUnitState>,
  id: string,
  update: (unit: ProgressUnitState) => ProgressUnitState,
): ReadonlyArray<ProgressUnitState> => units.map((unit) => (unit.id === id ? update(unit) : unit));

/** Fold one event into the state. UnitStarted and UnitResolved admit unknown units. */
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
      const unit: ProgressUnitState = {
        id: event.unitId,
        label: event.label,
        ...(event.parentUnitId === undefined ? {} : { parentId: event.parentUnitId }),
        index: event.index,
        ...(event.total === undefined ? {} : { total: event.total }),
        status: "running",
        ...(state.phase === undefined ? {} : { phase: state.phase }),
        startedAtMs: event.atMs,
      };
      const known = state.units.some((candidate) => candidate.id === event.unitId);
      return {
        ...state,
        lastSeq,
        units: known ? replaceUnit(state.units, event.unitId, () => unit) : [...state.units, unit],
      };
    }
    case "UnitProgress":
      return {
        ...state,
        lastSeq,
        // The event states the attempt it measured, so an event without one
        // leaves the unit on no attempt rather than on a stale earlier one.
        units: replaceUnit(state.units, event.unitId, ({ attempt: _replaced, ...unit }) => ({
          ...unit,
          measure: {
            done: event.done,
            ...(event.total === undefined ? {} : { total: event.total }),
            unit: event.unit,
          },
          ...(event.attempt === undefined ? {} : { attempt: event.attempt }),
        })),
      };
    case "UnitResolved": {
      const known = state.units.some((candidate) => candidate.id === event.unitId);
      const resolved = (unit: ProgressUnitState): ProgressUnitState => ({
        ...unit,
        label: event.label,
        status: event.state,
        settledAtMs: event.atMs,
        ...(event.failure === undefined ? {} : { failure: event.failure }),
      });
      return {
        ...state,
        lastSeq,
        units: known
          ? replaceUnit(state.units, event.unitId, resolved)
          : [
              ...state.units,
              resolved({
                id: event.unitId,
                label: event.label,
                index: event.index,
                ...(event.total === undefined ? {} : { total: event.total }),
                status: "running",
                ...(state.phase === undefined ? {} : { phase: state.phase }),
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

/** Elapsed milliseconds of the operation at `nowMs`, or at settlement. */
export const operationElapsedMs = (state: ProgressState, nowMs?: number): number | undefined => {
  if (state.operation === undefined) return undefined;
  const end = state.settled?.atMs ?? nowMs;
  return end === undefined ? undefined : Math.max(0, end - state.operation.startedAtMs);
};
