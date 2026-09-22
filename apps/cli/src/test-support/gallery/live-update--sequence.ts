import type { Doc } from "../../screen/doc.js";
import { liveLedgerDoc } from "../../screen/live-ledger.js";
import { initialProgress, reduceProgress, type ProgressState } from "../../screen/progress.js";
import type { TerminalSize } from "../../screen/scene.js";
import { liveUpdateNowMs, liveUpdatePlan, liveUpdateThrough } from "./samples/operation-stress.js";

/**
 * One update, cut at four moments of the same recorded event log, so the
 * gallery reviews the live ledger over time rather than as a single frame:
 * what it shows when the first unit starts, what it shows once several have
 * settled, what it shows when one fails, and what it shows on the last unit.
 *
 * The four frames share a log, so a row that leaves the window between them
 * left because the window's own rules put it there.
 */
const frame =
  (index: number, phase: "started" | "settled") =>
  (terminal: TerminalSize): Doc => {
    const state: ProgressState = liveUpdateThrough(index, phase).reduce(
      reduceProgress,
      initialProgress,
    );
    return liveLedgerDoc(state, {
      plan: liveUpdatePlan,
      rows: terminal.rows - 2,
      nowMs: liveUpdateNowMs(index),
    });
  };

/** The first unit in flight, every other row still waiting its turn. */
export const liveUpdateStart = frame(0, "started");

/** Four units settled as planned and the fifth running. */
export const liveUpdateMid = frame(4, "started");

/** The moment the sixth unit settles as failed. */
export const liveUpdateFailure = frame(5, "settled");

/** The last unit in flight, with everything that happened behind it. */
export const liveUpdateLast = frame(11, "started");
