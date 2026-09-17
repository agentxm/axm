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
  aside: "in this project",
  columns: [
    { header: "Extension", role: "name" },
    { header: "Version", role: "fixed", priority: "optional" },
  ],
  rows: [
    { id: "skill:code-review", mark: "create", cells: ["code-review", "1.2.0"] },
    { id: "skill:deploy", mark: "update", cells: ["deploy", "0.4.1"] },
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
    // Before the apply phase neither unit has started.
    expect(shape(joinLiveRows(stateAt(11), installPlan))).toEqual([
      ["pending", "waiting", "code-review", "1.2.0", "waiting", ""],
      ["pending", "waiting", "deploy", "0.4.1", "waiting", ""],
    ]);
    // Mid-download the running row carries the phase and how far it has come.
    expect(shape(joinLiveRows(stateAt(13), installPlan))).toEqual([
      ["active", "working", "code-review", "1.2.0", "applying", "512 KB / 2 MB"],
      ["pending", "waiting", "deploy", "0.4.1", "waiting", ""],
    ]);
    // A unit that changed as planned keeps the mark the plan gave it; one
    // that failed carries the mark of the state it reached.
    expect(shape(joinLiveRows(stateAt(17), installPlan))).toEqual([
      ["settled", "create", "code-review", "1.2.0", "applied", ""],
      ["settled", "failed", "deploy", "0.4.1", "failed", ""],
    ]);
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
      ["settled", "create", "extension sources", "applied", ""],
      ["settled", "create", "lockfile reconciliation", "applied", ""],
      ["active", "working", "code-review", "applying", "512 KB / 2 MB"],
    ]);
  });
});

describe("liveWindow", () => {
  const rows = (places: ReadonlyArray<LiveRow["place"]>): ReadonlyArray<LiveRow> =>
    places.map((place, index) => ({
      place,
      row: { id: String(index), mark: "waiting", cells: [String(index)] },
    }));

  it("shows work in flight first, then the units waiting their turn", () => {
    const window = liveWindow(rows(["pending", "active", "settled", "pending"]), 10);
    expect(window.rows.map((row) => row.id)).toEqual(["1", "0", "3"]);
    expect(window.folded).toBeUndefined();
  });

  it("folds what it cannot show, and counts what has already settled", () => {
    const window = liveWindow(rows(["active", ...Array(39).fill("pending")]), 6);
    expect(window.rows).toHaveLength(5);
    expect(window.folded).toEqual({
      mark: "waiting",
      count: 35,
      noun: "more waiting",
      // Nothing has settled yet, so the fold line claims nothing about done work.
    });
  });

  it("names a fold that hides work in flight without calling it waiting", () => {
    const window = liveWindow(rows(["active", "active", "active", "settled"]), 2);
    expect(window.folded).toEqual({ mark: "waiting", count: 2, noun: "more", hint: "1 done" });
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
      " ·   deploy                        0.4.1     waiting",
      "",
      "applying 1 of 2 in 1.4s",
      "--verbose for details",
    ]);
  });

  it("is empty before an operation starts and once it has settled", () => {
    expect(paint(initialProgress, { plan: installPlan })).toEqual([]);
    expect(paint(stateAt(recordedInstallLog.length), { plan: installPlan })).toEqual([]);
  });

  it("holds a forty-unit plan inside a short terminal, with a fold line", () => {
    const wide: LivePlan = {
      ...installPlan,
      rows: Array.from({ length: 40 }, (_, index) => ({
        id: `unit-${String(index)}`,
        mark: "create" as const,
        cells: [`@acme/skills/unit-${String(index)}`, "1.0.0"],
      })),
    };
    // Sixteen rows less the two the region leaves free.
    const lines = paint(stateAt(12), { plan: wide, rows: 14 });
    expect(lines.length).toBeLessThanOrEqual(14);
    expect(lines.filter((line) => line.includes("@acme"))).toHaveLength(7);
    expect(lines.at(-4)).toBe(" ·   33 more waiting");
    // The status line and the hint survive the squeeze; the rows give way.
    expect(lines.at(-2)).toBe("applying 0 of 40 in 1.4s");
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
