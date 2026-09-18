/**
 * Progress narration — the transcript lines a terminal without animation gets.
 *
 * Where the live region cannot repaint, the same transitions the live ledger
 * would have shown become transcript lines: one when the operation starts, one
 * when it rolls back, one per wait, and one when it settles. All wording lives
 * here, beside the painter; the frame paints documents and never formats
 * events.
 */

import type { Doc, Text } from "./doc.js";
import { factParts } from "./docs.js";
import { duration, settledOutcomeTone, systemWaitStatus, unitState } from "./phrases.js";
import { operationElapsedMs, type ProgressState } from "./progress.js";

const settledLine = (state: ProgressState): Doc => {
  if (state.settled === undefined) return [];
  const name = state.operation?.name;
  if (name === undefined) return [];
  const elapsed = operationElapsedMs(state);
  const failedUnits = state.units.filter(
    (unit) => unit.status === "failed" || unit.status === "interrupted",
  );
  const aside: Text | undefined =
    elapsed === undefined
      ? undefined
      : failedUnits.length === 0
        ? duration(elapsed)
        : `${duration(elapsed)}, ${String(failedUnits.length)} ${unitState(failedUnits[0]?.status === "interrupted" ? "interrupted" : "failed")}`;
  return [
    {
      _tag: "headline",
      tone: settledOutcomeTone(state.settled.outcome),
      text: name,
      ...(aside === undefined ? {} : { aside: factParts([aside]) }),
    },
  ];
};

/**
 * Transcript lines one state transition produces where nothing animates. An
 * animated terminal writes none of them: its live ledger already showed the
 * rows, and at settlement the result ledger stands in for the whole run.
 */
export const progressTransitionDoc = (
  previous: ProgressState | undefined,
  next: ProgressState,
): Doc => {
  const settledNow = next.settled !== undefined && previous?.settled === undefined;
  const doc: Array<Doc[number]> = [];
  if (next.operation !== undefined && previous?.operation === undefined) {
    doc.push({ _tag: "headline", tone: "info", text: next.operation.name });
  }
  if (next.phase === "restoration" && previous?.phase !== "restoration") {
    doc.push({
      _tag: "headline",
      tone: "warn",
      text: `Rolling back ${next.operation?.name ?? "changes"}`,
    });
  }
  for (const wait of next.waiting) {
    if (previous?.waiting.some((known) => known.subject === wait.subject) === true) continue;
    doc.push({
      _tag: "headline",
      tone: "warn",
      text: `${systemWaitStatus(wait.blockingClass)}${wait.detail.length === 0 ? "" : `: ${wait.detail}`}`,
    });
  }
  if (settledNow) doc.push(...settledLine(next));
  return doc;
};
