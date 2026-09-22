import { describe, expect, it } from "vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import type { OperationEvent } from "@agentxm/workspace/transitions/planning";
import { initialProgress, reduceProgress, type ProgressState } from "./progress.js";
import { progressActivity, progressTransitionDoc } from "./progress-view.js";
import { paintText } from "./paint-text.js";
import { paintLivePart } from "./scene.js";

export const specification = defineSpecification({
  requirement: "cli/activity-reports-observed-work",
  title: "Activity describes observed work without inventing progress",
  statement:
    "AXM shall identify the current meaningful activity and known waits or retries, report counts only for a coherent observed population, distinguish finished work from durable changes, and summarize phases and exceptions at normal detail without accumulating continuous measurements at any detail level.",
  class: "human-factors",
  role: "experience",
  goals: ["actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "cli/long-running-operations-emit-lifecycle-events",
    "cli/retried-work-names-the-attempt-in-flight",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const start: ReadonlyArray<OperationEvent> = [
  {
    _tag: "OperationStarted",
    operationId: "check",
    name: "Update workspace",
    mode: "apply",
    seq: 1,
    atMs: 0,
  },
  { _tag: "PhaseStarted", phase: "acquisition", seq: 2, atMs: 1 },
  {
    _tag: "UnitStarted",
    unitId: "download-a",
    label: "Download review skill",
    index: 0,
    total: 2,
    seq: 3,
    atMs: 2,
  },
];
const paint = (state: ProgressState) =>
  paintText(progressActivity(state)({ columns: 160, rows: 4, nowMs: 1000, spinner: "*" }), {
    colors: false,
    width: "unbounded",
  }).join("\n");

describe("truthful operation activity", () => {
  it("keeps the current activity ahead of an operation name in a narrow pane", () => {
    const state = start.reduce(reduceProgress, initialProgress);
    const size = { columns: 19, rows: 2 };
    const doc = progressActivity(state)({ ...size, nowMs: 1000, spinner: "*" });
    const lines = paintLivePart(doc, size, { colors: false });
    expect(lines[0]).toContain("Acquiring");
  });

  it("counts completed downloads as work, without claiming installation", () => {
    let state = start.reduce(reduceProgress, initialProgress);
    expect(paint(state)).toContain("0 of 2 work items finished");
    expect(paint(state)).toContain("Acquiring content");
    state = reduceProgress(state, {
      _tag: "UnitResolved",
      unitId: "download-a",
      label: "Download review skill",
      index: 0,
      total: 2,
      state: "committed",
      seq: 4,
      atMs: 50,
    });
    expect(paint(state)).toContain("1 of 2 work items finished");
    expect(paint(state)).not.toMatch(/installed|published|100%/u);
    state = reduceProgress(state, {
      _tag: "UnitStarted",
      unitId: "unrelated",
      label: "Another collector",
      index: 0,
      total: 7,
      seq: 5,
      atMs: 60,
    });
    expect(paint(state)).not.toContain(" of ");
    state = reduceProgress(state, {
      _tag: "PhaseStarted",
      phase: "verification",
      seq: 6,
      atMs: 61,
    });
    expect(paint(state)).toContain("Verifying agent output");
    expect(paint(state)).not.toContain(" of ");
  });

  it("reports known waiting conditions and failure before advancing the phase", () => {
    let state = start.reduce(reduceProgress, initialProgress);
    state = reduceProgress(state, {
      _tag: "Waiting",
      blockingClass: "resource-conflict",
      subject: "workspace",
      detail: "Another axm process owns the workspace",
      seq: 4,
      atMs: 4,
    });
    expect(paint(state)).toContain("Another axm process owns the workspace");
    const failed = reduceProgress(state, {
      _tag: "UnitResolved",
      unitId: "download-a",
      label: "Download review skill",
      index: 0,
      total: 2,
      state: "failed",
      failure: { category: "network", detail: "Archive unavailable" },
      seq: 5,
      atMs: 5,
    });
    expect(
      paintText(progressTransitionDoc(state, failed), { colors: false, width: "unbounded" }).join(
        "\n",
      ),
    ).toContain("Archive unavailable");
    const next = reduceProgress(failed, {
      _tag: "PhaseStarted",
      phase: "verification",
      seq: 6,
      atMs: 6,
    });
    expect(
      paintText(progressTransitionDoc(failed, next), { colors: false, width: "unbounded" }).join(
        "\n",
      ),
    ).toContain("1 did not complete as planned");
  });

  for (const detailed of [false, true]) {
    it(`keeps transcript volume independent of measurement frequency (detailed=${detailed})`, () => {
      const narrate = (ticks: number) => {
        let state = initialProgress;
        const lines: Array<string> = [];
        const accept = (event: OperationEvent) => {
          const next = reduceProgress(state, event);
          lines.push(
            ...paintText(progressTransitionDoc(state, next, { detailed }), {
              colors: false,
              width: "unbounded",
            }),
          );
          state = next;
        };
        for (const event of start) accept(event);
        for (let tick = 0; tick < ticks; tick += 1)
          accept({
            _tag: "UnitProgress",
            unitId: "download-a",
            done: tick,
            unit: "bytes",
            seq: tick + 4,
            atMs: tick + 4,
          });
        accept({
          _tag: "UnitResolved",
          unitId: "download-a",
          label: "Download review skill",
          index: 0,
          total: 2,
          state: "committed",
          seq: ticks + 5,
          atMs: ticks + 5,
        });
        accept({ _tag: "PhaseStarted", phase: "verification", seq: ticks + 6, atMs: ticks + 6 });
        return lines.join("\n");
      };
      expect(narrate(10_000)).toBe(narrate(1));
      expect(narrate(1)).toContain("Finished acquiring content");
      expect(narrate(1).includes("Finished Download review skill")).toBe(detailed);
    });
  }
});
