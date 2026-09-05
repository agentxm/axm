import { describe, expect, it } from "vitest";

import { stripTerminalFormatting } from "./output-policy.js";
import { paintText } from "./paint-text.js";
import { initialProgress, reduceProgress, type ProgressState } from "./progress.js";
import { recordedInstallLog } from "./progress.internal.test.js";
import { liveProgressLines, progressTransitionDoc } from "./progress-view.js";
import { displayWidth } from "./width.js";

const stateAt = (count: number): ProgressState =>
  recordedInstallLog.slice(0, count).reduce(reduceProgress, initialProgress);

const paint = (state: ProgressState, width: number, colors = false) =>
  liveProgressLines(state, { width, colors, spinner: "◐", nowMs: 2_000 });

describe("liveProgressLines", () => {
  it("shows the operation, phase, counts, running units, and open waits", () => {
    expect(paint(stateAt(13), 80)).toEqual([
      "◐ Install skill — applying (0/2) · 1s",
      "  ◐ code-review  512 KB / 2 MB",
    ]);
    expect(paint(stateAt(9), 80)).toEqual([
      "◐ Install skill — validating · 1s",
      "▲ Waiting — another operation holds the workspace: axm sync (pid 41)",
    ]);
  });

  it.each([40, 80, 120])("keeps every live line within %i columns", (width) => {
    for (let count = 1; count <= recordedInstallLog.length; count += 1) {
      for (const line of paint(stateAt(count), width)) {
        expect(displayWidth(line)).toBeLessThanOrEqual(width);
      }
    }
  });

  it("is empty before the operation starts and after it settles", () => {
    expect(paint(initialProgress, 80)).toEqual([]);
    expect(paint(stateAt(recordedInstallLog.length), 80)).toEqual([]);
  });

  it("paints the same lines with color on and off", () => {
    const plain = paint(stateAt(13), 80).join("\n");
    const colored = paint(stateAt(13), 80, true).join("\n");
    expect(colored).toContain("\u001b[");
    expect(stripTerminalFormatting(colored)).toBe(plain);
  });
});

describe("progressTransitionDoc", () => {
  const paintTransition = (from: number, to: number, live: boolean) =>
    paintText(
      progressTransitionDoc(from === 0 ? undefined : stateAt(from), stateAt(to), { live }),
      { width: 80, colors: false },
    );

  it("narrates start, waits, restoration, and settlement in plain mode", () => {
    expect(paintTransition(0, 1, false)).toEqual(["● Install skill"]);
    expect(paintTransition(8, 9, false)).toEqual([
      "▲ Waiting — another operation holds the workspace: axm sync (pid 41)",
    ]);
    expect(paintTransition(17, 18, false)).toEqual(["▲ Rolling back Install skill"]);
    expect(paintTransition(18, 19, false)).toEqual(["✖ Install skill  1.5s · 1 failed"]);
    expect(paintTransition(12, 13, false)).toEqual([]);
  });

  it("collapses to the settlement line alone in live mode", () => {
    expect(paintTransition(0, 1, true)).toEqual([]);
    expect(paintTransition(8, 9, true)).toEqual([]);
    expect(paintTransition(18, 19, true)).toEqual(["✖ Install skill  1.5s · 1 failed"]);
  });
});
