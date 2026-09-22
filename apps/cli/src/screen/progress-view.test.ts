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

  it("narrates start, phase activity, waits, restoration, and settlement", () => {
    expect(paintTransition(0, 1)).toEqual([" ●   Install skill"]);
    expect(paintTransition(1, 2)).toEqual([" ●   Resolving sources"]);
    expect(paintTransition(4, 5)).toEqual([" ●   Planning"]);
    expect(paintTransition(7, 8)).toEqual([" ●   Validating"]);
    expect(paintTransition(8, 9)).toEqual([
      " ▲   Waiting - another operation holds the workspace: axm sync (pid 41)",
    ]);
    expect(paintTransition(10, 11)).toEqual([" ●   Applying"]);
    expect(paintTransition(17, 18)).toEqual([" ▲   Rolling back Install skill"]);
    expect(paintTransition(18, 19)).toEqual([" ✖   Install skill                 1.5s, 1 failed"]);
  });

  it("narrates a unit once and leaves continuous measurements out of the transcript", () => {
    expect(paintTransition(2, 3)).toEqual([" ●   Working on extension sources"]);
    expect(paintTransition(11, 12)).toEqual([" ●   Working on code-review"]);
    expect(paintTransition(12, 13)).toEqual([]);
    expect(paintTransition(14, 15)).toEqual([]);
  });

  it("narrates only a new retry attempt, without claiming completed bytes", () => {
    const started = stateAt(12);
    const first = reduceProgress(started, {
      _tag: "UnitProgress",
      seq: 20,
      atMs: 2_000,
      unitId: "skill:code-review",
      done: 0,
      total: 2_048_000,
      unit: "bytes",
      attempt: { n: 1, of: 3 },
    });
    const retry = reduceProgress(first, {
      _tag: "UnitProgress",
      seq: 21,
      atMs: 2_001,
      unitId: "skill:code-review",
      done: 0,
      total: 2_048_000,
      unit: "bytes",
      attempt: { n: 2, of: 3 },
    });
    const continuing = reduceProgress(retry, {
      _tag: "UnitProgress",
      seq: 22,
      atMs: 2_002,
      unitId: "skill:code-review",
      done: 512_000,
      total: 2_048_000,
      unit: "bytes",
      attempt: { n: 2, of: 3 },
    });
    expect(progressTransitionDoc(started, first)).toEqual([]);
    expect(paintText(progressTransitionDoc(first, retry), { width: 80, colors: false })).toEqual([
      " ●   code-review: retry 2 of 3",
    ]);
    expect(progressTransitionDoc(retry, continuing)).toEqual([]);
  });

  it("narrates each wait once, however many states pass while it is open", () => {
    expect(paintTransition(9, 9)).toEqual([]);
    expect(paintTransition(9, 10)).toEqual([]);
  });
});
