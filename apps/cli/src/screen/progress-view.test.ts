import { describe, expect, it } from "vitest";

import { paintText } from "./paint-text.js";
import { initialProgress, reduceProgress, type ProgressState } from "./progress.js";
import { recordedInstallLog } from "./progress.test.js";
import { progressTransitionDoc } from "./progress-view.js";

const stateAt = (count: number): ProgressState =>
  recordedInstallLog.slice(0, count).reduce(reduceProgress, initialProgress);

describe("progressTransitionDoc", () => {
  const paintTransition = (from: number, to: number) =>
    paintText(progressTransitionDoc(from === 0 ? undefined : stateAt(from), stateAt(to)), {
      width: 80,
      colors: false,
    });

  it("narrates start, waits, restoration, and settlement", () => {
    expect(paintTransition(0, 1)).toEqual([" ●   Install skill"]);
    expect(paintTransition(8, 9)).toEqual([
      " ▲   Waiting - another operation holds the workspace: axm sync (pid 41)",
    ]);
    expect(paintTransition(17, 18)).toEqual([" ▲   Rolling back Install skill"]);
    expect(paintTransition(18, 19)).toEqual([" ✖   Install skill                 1.5s, 1 failed"]);
  });

  it("says nothing about a unit, because per-unit lines are the live ledger's", () => {
    expect(paintTransition(11, 12)).toEqual([]);
    expect(paintTransition(12, 13)).toEqual([]);
    expect(paintTransition(14, 15)).toEqual([]);
  });

  it("narrates each wait once, however many states pass while it is open", () => {
    expect(paintTransition(9, 9)).toEqual([]);
    expect(paintTransition(9, 10)).toEqual([]);
  });
});
