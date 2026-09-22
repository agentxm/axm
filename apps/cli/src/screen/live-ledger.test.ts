import { describe, expect, it } from "vitest";

import type { OperationEvent } from "@agentxm/workspace/transitions/planning";

import { plain } from "./doc.js";
import {
  joinLiveRows,
  liveLedgerDoc,
  liveWindow,
  type LivePlan,
  type LiveRow,
} from "./live-ledger.js";
import { paintText } from "./paint-text.js";
import { initialProgress, reduceProgress, type ProgressState } from "./progress.js";
import { recordedInstallLog } from "./progress.test.js";
import { displayWidth } from "./width.js";

const fold = (events: ReadonlyArray<OperationEvent>): ProgressState =>
  events.reduce(reduceProgress, initialProgress);

const stateAt = (count: number): ProgressState => fold(recordedInstallLog.slice(0, count));

/** The plan the recorded install log applies: the two skills it names. */
const installPlan: LivePlan = {
  title: "Installing",
  aside: [{ text: "in this project" }],
  columns: [
    { header: "Extension", role: "name" },
    { header: "Version", role: "fixed", priority: "optional" },
  ],
  rows: [
    {
      id: "skill:code-review",
      plannedMark: "create",
      plannedStatus: "install",
      settledStatus: "created",
      cells: ["code-review", "1.2.0"],
    },
    {
      id: "skill:deploy",
      plannedMark: "update",
      plannedStatus: "update",
      settledStatus: "updated",
      cells: ["deploy", "0.4.1"],
    },
  ],
  hint: "--verbose for details",
};

/** The mark and the cells of each row, which is what a reader compares. */
const shape = (rows: ReadonlyArray<LiveRow>) =>
  rows.map((row) => [row.place, row.row.mark, ...row.row.cells.map(plain)]);

const paint = (
  state: ProgressState,
  options?: { plan?: LivePlan; rows?: number; width?: number },
) =>
  paintText(
    liveLedgerDoc(state, {
      ...(options?.plan === undefined ? {} : { plan: options.plan }),
      rows: options?.rows ?? 22,
      nowMs: 2_400,
    }),
    { width: options?.width ?? 80, colors: false },
  );

describe("joinLiveRows", () => {
  it("moves a plan row from waiting through working to its final mark", () => {
    // Before the apply phase neither unit has started, and both carry the
    // waiting mark with the word their plan gave them.
    expect(shape(joinLiveRows(stateAt(11), installPlan))).toEqual([
      ["pending", "waiting", "code-review", "1.2.0", "install", ""],
      ["pending", "waiting", "deploy", "0.4.1", "update", ""],
    ]);
    // Mid-download the running row carries the phase and how far it has come.
    expect(shape(joinLiveRows(stateAt(13), installPlan))).toEqual([
      ["active", "working", "code-review", "1.2.0", "applying", "512 KB / 2 MB"],
      ["pending", "waiting", "deploy", "0.4.1", "update", ""],
    ]);
    // A settled row keeps its place: one took its plan's mark and the word
    // its result row will use, and the one that failed says so.
    expect(shape(joinLiveRows(stateAt(17), installPlan))).toEqual([
      ["settled", "create", "code-review", "1.2.0", "created", ""],
      ["unsettled", "failed", "deploy", "0.4.1", "failed", ""],
    ]);
  });

  it("gives a unit that did not settle as planned its state and its reason", () => {
    const failed = reduceProgress(stateAt(13), {
      _tag: "UnitResolved",
      seq: 30,
      atMs: 2_200,
      unitId: "skill:code-review",
      label: "code-review",
      state: "failed",
      index: 0,
      total: 2,
      failure: { category: "network", detail: "The registry refused the request." },
    });
    const [row] = joinLiveRows(failed, installPlan);
    expect(shape(joinLiveRows(failed, installPlan))[0]).toEqual([
      "unsettled",
      "failed",
      "code-review",
      "1.2.0",
      "failed",
      "",
    ]);
    expect(plain(row?.row.reason ?? "")).toBe("The registry refused the request.");
  });

  it("rolls nested units up into the row that planned them", () => {
    const nested = fold([
      ...recordedInstallLog.slice(0, 12),
      {
        _tag: "UnitStarted",
        seq: 20,
        atMs: 1_950,
        unitId: "download",
        parentUnitId: "skill:code-review",
        label: "downloading",
        index: 0,
      },
      {
        _tag: "UnitProgress",
        seq: 21,
        atMs: 1_960,
        unitId: "download",
        done: 96_000,
        total: 192_000,
        unit: "bytes",
      },
    ]);
    expect(shape(joinLiveRows(nested, installPlan))[0]).toEqual([
      "active",
      "working",
      "code-review",
      "1.2.0",
      "downloading",
      "96 KB / 192 KB",
    ]);

    // The projection that follows the download is the same row, measured anew.
    const projecting = fold([
      ...recordedInstallLog.slice(0, 12),
      {
        _tag: "UnitStarted",
        seq: 20,
        atMs: 1_950,
        unitId: "project",
        parentUnitId: "skill:code-review",
        label: "projecting agents",
        index: 0,
      },
      {
        _tag: "UnitProgress",
        seq: 21,
        atMs: 1_960,
        unitId: "project",
        done: 2,
        total: 3,
        unit: "items",
      },
    ]);
    const rows = joinLiveRows(projecting, installPlan);
    expect(rows).toHaveLength(2);
    expect(shape(rows)[0]).toEqual([
      "active",
      "working",
      "code-review",
      "1.2.0",
      "projecting agents",
      "2/3 items",
    ]);
  });

  it("pauses the row a wait names as its subject", () => {
    const parked = reduceProgress(stateAt(13), {
      _tag: "Waiting",
      seq: 20,
      atMs: 2_010,
      blockingClass: "approval-required",
      subject: "skill:code-review",
      detail: "",
    });
    expect(shape(joinLiveRows(parked, installPlan))[0]).toEqual([
      "active",
      "warn",
      "code-review",
      "1.2.0",
      "paused",
      "approval is required",
    ]);
  });

  it("synthesizes rows from the units an operation with no plan reports", () => {
    expect(shape(joinLiveRows(stateAt(13), undefined))).toEqual([
      ["settled", "waiting", "extension sources", "changed", ""],
      ["settled", "waiting", "lockfile reconciliation", "changed", ""],
      ["active", "working", "code-review", "applying", "512 KB / 2 MB"],
    ]);
  });
});

describe("liveWindow", () => {
  const rows = (
    places: ReadonlyArray<LiveRow["place"]>,
    reasoned: ReadonlyArray<number> = [],
  ): ReadonlyArray<LiveRow> =>
    places.map((place, index) => ({
      place,
      row: {
        id: String(index),
        mark: "waiting",
        cells: [String(index)],
        ...(reasoned.includes(index) ? { reason: "it did not settle" } : {}),
      },
    }));

  it("keeps every row, in plan order, while they fit", () => {
    const window = liveWindow(rows(["pending", "active", "settled", "pending"]), 10);
    expect(window.rows.map((row) => row.id)).toEqual(["0", "1", "2", "3"]);
    expect(window.folded).toBeUndefined();
  });

  it("folds what it cannot show, and counts what has already finished", () => {
    const window = liveWindow(rows(["active", ...Array(39).fill("pending")]), 6);
    expect(window.rows).toHaveLength(5);
    expect(window.folded).toEqual({
      mark: "waiting",
      count: 35,
      noun: "more waiting",
      // Nothing has finished yet, so the fold line claims nothing about it.
    });
  });

  it("gives up a settled row before one that did not settle as planned", () => {
    const window = liveWindow(rows(["settled", "unsettled", "settled", "active"]), 3);
    expect(window.rows.map((row) => row.id)).toEqual(["1", "3"]);
    expect(window.folded).toEqual({
      mark: "waiting",
      count: 2,
      noun: "more",
      hint: "2 done, 1 failed",
    });
  });

  it("counts the line a reason takes against the height it was given", () => {
    // Four rows, two of which carry a reason: six lines in five, so the
    // window shows what fits and folds the rest.
    const window = liveWindow(rows(["unsettled", "unsettled", "settled", "settled"], [0, 1]), 5);
    expect(window.rows.map((row) => row.id)).toEqual(["0", "1"]);
    expect(window.folded?.count).toBe(2);
  });

  it("gives up its rows before it gives up the line that stands for them", () => {
    expect(liveWindow(rows(["active", "pending"]), 0).rows).toEqual([]);
    expect(liveWindow(rows(["active", "pending"]), 1).rows).toEqual([]);
  });
});

describe("liveLedgerDoc", () => {
  it("paints the plan's rows, the fold, and how far the operation has come", () => {
    expect(paint(stateAt(13), { plan: installPlan })).toEqual([
      "Installing  in this project",
      "",
      "     Extension                     Version   Status     Detail",
      " ◒   code-review                   1.2.0     applying   512 KB / 2 MB",
      " ·   deploy                        0.4.1     update",
      "",
      "applying 0 of 2 done in 1.4s",
      "--verbose for details",
    ]);
  });

  it("stands a wait that names no unit beneath the ledger in place of the status line", () => {
    const state = fold([
      ...recordedInstallLog.slice(0, 11),
      {
        _tag: "Waiting",
        seq: 900,
        atMs: 1_200,
        blockingClass: "resource-conflict",
        subject: "workspace-transition",
        detail: "axm sync (pid 4122)",
      },
    ]);
    expect(paint(state, { plan: installPlan })).toEqual([
      "Installing  in this project",
      "",
      "     Extension                     Version   Status    Detail",
      " ·   code-review                   1.2.0     install",
      " ·   deploy                        0.4.1     update",
      "",
      " ◒   Waiting - another operation holds the workspace   1.2s",
      "     axm sync (pid 4122)",
      "ctrl-c stops waiting; nothing has been changed",
      "--verbose for details",
    ]);
  });

  it("shows the plan before an operation starts and is empty once it has settled", () => {
    expect(paint(initialProgress, { plan: installPlan })).toContain(
      " ·   code-review                   1.2.0     install",
    );
    expect(paint(stateAt(recordedInstallLog.length), { plan: installPlan })).toEqual([]);
  });

  it("holds a forty-unit plan inside a short terminal, with a fold line", () => {
    const wide: LivePlan = {
      ...installPlan,
      rows: Array.from({ length: 40 }, (_, index) => ({
        id: `unit-${String(index)}`,
        plannedMark: "create" as const,
        plannedStatus: "install",
        cells: [`@acme/skills/unit-${String(index)}`, "1.0.0"],
      })),
    };
    // Sixteen rows less the two the region leaves free.
    const lines = paint(stateAt(12), { plan: wide, rows: 14 });
    expect(lines.length).toBeLessThanOrEqual(14);
    expect(lines.filter((line) => line.includes("@acme"))).toHaveLength(7);
    expect(lines.at(-4)).toBe(" ·   33 more waiting");
    // The status line and the hint survive the squeeze; the rows give way.
    expect(lines.at(-2)).toBe("applying 0 of 40 done in 1.4s");
    expect(lines.at(-1)).toBe("--verbose for details");
  });

  it("keeps every line inside the width at every recorded state", () => {
    for (const width of [40, 80, 120, 200]) {
      for (let count = 1; count <= recordedInstallLog.length; count += 1) {
        for (const line of paint(stateAt(count), { plan: installPlan, width })) {
          expect(displayWidth(line), `${String(width)}: ${line}`).toBeLessThanOrEqual(width);
        }
      }
    }
  });
});
