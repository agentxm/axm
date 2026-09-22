import { describe, expect, it } from "vitest";

import { paintText } from "./paint-text.js";
import { initialProgress, reduceProgress, type ProgressState } from "./progress.js";
import { recordedInstallLog } from "./progress.test.js";
import { progressActivity, progressTransitionDoc, type NarrationOptions } from "./progress-view.js";

const stateAt = (count: number): ProgressState =>
  recordedInstallLog.slice(0, count).reduce(reduceProgress, initialProgress);
const transition = (from: number, to: number, options?: NarrationOptions) =>
  paintText(progressTransitionDoc(from === 0 ? undefined : stateAt(from), stateAt(to), options), {
    width: "unbounded",
    colors: false,
  }).join("\n");
const activity = (state: ProgressState) =>
  paintText(progressActivity(state)({ columns: 120, rows: 4, nowMs: 3_000, spinner: "*" }), {
    width: "unbounded",
    colors: false,
  }).join("\n");

describe("operation narration", () => {
  it("retains phase conclusions and exceptions without logging every successful unit", () => {
    expect(transition(0, 1)).toContain("Install skill");
    expect(transition(2, 3)).toBe("");
    expect(transition(3, 4)).toBe("");
    expect(transition(4, 5)).toContain("Finished resolving sources");
    expect(transition(16, 17)).toContain("deploy: failed");
    expect(transition(16, 17)).toContain("No reason was reported.");
    expect(transition(17, 18)).toContain("1 did not complete as planned");
    expect(transition(17, 18)).toContain("Restoring affected changes");
    expect(transition(18, 19)).not.toContain("Install skill");
  });

  it("adds unit details only when requested, retaining actionable quiet failures", () => {
    expect(transition(2, 3, { detailed: true })).toContain("Working on extension sources");
    expect(transition(3, 4, { detailed: true })).toContain("Finished extension sources");
    expect(transition(4, 5, { quiet: true })).toBe("");
    expect(transition(16, 17, { quiet: true })).toContain("deploy: failed");
    expect(transition(2, 3, { quiet: true, detailed: true })).toBe("");
  });

  it("shares the same conclusions between animated and static output", () => {
    const animated = progressTransitionDoc(stateAt(4), stateAt(5));
    const plain = progressTransitionDoc(stateAt(4), stateAt(5), { static: true });
    expect(plain.slice(0, animated.length)).toEqual(animated);
    expect(transition(4, 5, { static: true })).toContain("Planning");
  });

  it("does not turn a stream of measurements into history at any verbosity", () => {
    for (const options of [{}, { detailed: true }, { quiet: true }, { static: true }]) {
      let previous = stateAt(12);
      for (let done = 0; done < 100; done += 1) {
        const next = reduceProgress(previous, {
          _tag: "UnitProgress",
          seq: done + 20,
          atMs: done + 2_000,
          unitId: "skill:code-review",
          done,
          total: 100,
          unit: "bytes",
        });
        expect(progressTransitionDoc(previous, next, options)).toEqual([]);
        previous = next;
      }
    }
  });

  it("names each new retry once and suppresses stale byte claims during it", () => {
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
      done: 512_000,
      total: 2_048_000,
      unit: "bytes",
      attempt: { n: 2, of: 3 },
    });
    expect(progressTransitionDoc(started, first)).toEqual([]);
    expect(
      paintText(progressTransitionDoc(first, retry), { width: 80, colors: false }).join("\n"),
    ).toContain("retry 2 of 3");
    expect(progressTransitionDoc(retry, retry)).toEqual([]);
    expect(activity(retry)).toContain("retry 2 of 3");
    expect(activity(retry)).not.toContain("KB");
  });

  it("records waiting and resumption once without claiming an outcome", () => {
    expect(transition(8, 9)).toContain("axm sync (pid 41)");
    expect(transition(9, 9)).toBe("");
    expect(transition(9, 10)).toContain("Wait ended: axm sync (pid 41)");
    expect(transition(10, 10)).toBe("");
  });

  it("counts finished work without calling it installed extensions", () => {
    expect(activity(stateAt(16))).toContain("1 of 2 work items finished");
    expect(activity(stateAt(17))).toContain(
      "2 of 2 work items finished, 1 did not complete as planned",
    );
    expect(activity(stateAt(3))).not.toContain(" of ");
    expect(activity(stateAt(16))).not.toContain("extensions installed");
  });

  it("does not manufacture a denominator when concurrent producers disagree", () => {
    const next = reduceProgress(stateAt(16), {
      _tag: "UnitStarted",
      seq: 22,
      atMs: 2_400,
      unitId: "unrelated",
      label: "Another check",
      index: 2,
      total: 3,
    });
    expect(activity(next)).not.toContain(" of ");
  });

  it("does not call preview or deliberately skipped units failures", () => {
    for (const state of ["planned", "ready", "skipped"] as const) {
      const previous = stateAt(12);
      const next = reduceProgress(previous, {
        _tag: "UnitResolved",
        seq: 22,
        atMs: 2_400,
        unitId: "skill:code-review",
        label: "code-review",
        state,
        index: 0,
        total: 2,
      });
      expect(progressTransitionDoc(previous, next)).toEqual([]);
    }
  });
});
