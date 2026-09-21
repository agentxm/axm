import { describe, expect, it } from "vitest";
import * as Schema from "effect/Schema";

import { OperationEventSchema, type OperationEvent } from "@agentxm/workspace/transitions/planning";

import { defineSpecification } from "@agentxm/specification-metadata";

import { plain } from "./doc.js";
import { joinLiveRows, liveLedgerDoc, type LivePlan } from "./live-ledger.js";
import { paintText } from "./paint-text.js";
import { initialProgress, reduceProgress, type ProgressState } from "./progress.js";

export const specification = defineSpecification({
  requirement: "cli/live-progress-retains-settled-units",
  title: "Live progress keeps what has already happened in view",
  statement:
    "While an operation runs, a unit that has settled shall keep its row in the live ledger carrying the final mark and status word its result row will use, for as long as the rows fit the height the scene allows; when they do not, a row that did not settle as planned shall never leave before one that did, and what left shall be counted; the status line shall state how many units have finished out of the total and, once any has, how many did not settle as planned; and a unit that did not settle as planned shall state its reason on its live row as soon as it settles.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics", "extension-adoption"],
  boundary: "memory",
  boundaryRationale:
    "The live ledger is a pure function of a recorded event log and the space the scene gives, so the whole obligation is decided in memory.",
  methods: ["example"],
  derivedFrom: [
    "cli/retried-work-names-the-attempt-in-flight",
    "cli/unsettled-units-state-their-reason",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
  limitations: [
    {
      limitation:
        "Examples drive the projector and the live join over an authored event log. That a real terminal erases exactly the rows it painted when settled rows are retained is witnessed by the pseudo-terminal harness in `apps/cli-e2e`, not decided here.",
      retirementCondition:
        "Bind terminal evidence here if the live region ever paints a row the frame cannot erase.",
    },
  ],
});

const decodeOperationEvent = Schema.decodeUnknownSync(OperationEventSchema);
const encodeOperationEvent = Schema.encodeSync(OperationEventSchema);

const STARTED_AT = 1_000;

interface Unit {
  readonly name: string;
  readonly outcome: "committed" | "failed";
}

const REFUSED = "The registry refused the request.";

/** One update of `count` units, the first `failures` of which fail. */
const authoredLog = (units: ReadonlyArray<Unit>): ReadonlyArray<OperationEvent> => [
  {
    _tag: "OperationStarted",
    seq: 1,
    atMs: STARTED_AT,
    operationId: "update-1",
    name: "Updating",
    mode: "apply",
  },
  { _tag: "PhaseStarted", seq: 2, atMs: STARTED_AT + 1, phase: "apply" },
  ...units.flatMap((unit, index): ReadonlyArray<OperationEvent> => [
    {
      _tag: "UnitStarted",
      seq: 3 + index * 2,
      atMs: STARTED_AT + 10 + index * 10,
      unitId: unit.name,
      label: unit.name,
      index,
      total: units.length,
    },
    {
      _tag: "UnitResolved",
      seq: 4 + index * 2,
      atMs: STARTED_AT + 15 + index * 10,
      unitId: unit.name,
      label: unit.name,
      state: unit.outcome,
      index,
      total: units.length,
      ...(unit.outcome === "failed"
        ? { failure: { category: "network" as const, detail: REFUSED } }
        : {}),
    },
  ]),
];

const planOf = (units: ReadonlyArray<Unit>): LivePlan => ({
  title: "Updating",
  columns: [{ header: "Extension", role: "name" }],
  rows: units.map((unit) => ({
    id: unit.name,
    plannedMark: "update" as const,
    plannedStatus: "update",
    settledStatus: "updated",
    cells: [unit.name],
  })),
});

const fold = (events: ReadonlyArray<OperationEvent>): ProgressState =>
  events.reduce(reduceProgress, initialProgress);

const unitsOf = (count: number, failing: ReadonlyArray<number>): ReadonlyArray<Unit> =>
  Array.from({ length: count }, (_, index) => ({
    name: `@acme/skills/unit-${String(index).padStart(2, "0")}`,
    outcome: failing.includes(index) ? ("failed" as const) : ("committed" as const),
  }));

const painted = (units: ReadonlyArray<Unit>, rows: number, through?: number): string =>
  paintText(
    liveLedgerDoc(fold(authoredLog(units).slice(0, through)), {
      plan: planOf(units),
      rows,
      nowMs: STARTED_AT + 9_000,
    }),
    { width: 100, colors: false, wrap: false },
  ).join("\n");

describe("Live progress keeps what has happened in view", () => {
  it("keeps every settled row while the rows fit the height", () => {
    const units = unitsOf(12, [3]);
    // Every unit has settled but the last, which is still running.
    const lines = painted(units, 24, 2 + 11 * 2 + 1);
    for (const unit of units.slice(0, 11)) expect(lines).toContain(unit.name);
    // A unit that settled as planned says the word its result row will use.
    expect(lines).toMatch(/@acme\/skills\/unit-00\s+updated/u);
    expect(lines).toMatch(/@acme\/skills\/unit-03\s+failed/u);
  });

  it("states how many units have finished, and how many did not settle", () => {
    const units = unitsOf(12, [3, 7]);
    const lines = painted(units, 24, 2 + 9 * 2);
    expect(lines).toContain("9 of 12 done, 2 failed");
  });

  it("states a unit's reason on its live row as soon as it settles", () => {
    const units = unitsOf(3, [0]);
    const [row] = joinLiveRows(fold(authoredLog(units).slice(0, 4)), planOf(units));
    expect(plain(row?.row.reason ?? "")).toBe(REFUSED);
    expect(painted(units, 24, 4)).toContain(REFUSED);
  });

  it("keeps both failures in view at the last frame of a tall plan in a short terminal", () => {
    const units = unitsOf(40, [1, 2]);
    // Sixteen rows less the two the live region leaves free.
    const lines = painted(units, 14, undefined);
    expect(lines).toContain(units[1]?.name);
    expect(lines).toContain(units[2]?.name);
    expect(lines.split("\n").length).toBeLessThanOrEqual(14);
    // What left the window is counted, with what finished and what failed.
    expect(lines).toMatch(/\d+ more/u);
    expect(lines).toContain("38 done, 2 failed");
  });

  it("carries the failure fact through the published schema unchanged", () => {
    const [failed] = authoredLog(unitsOf(1, [0])).filter((event) => event._tag === "UnitResolved");
    expect(failed).toBeDefined();
    if (failed === undefined) return;
    expect(decodeOperationEvent(encodeOperationEvent(failed))).toEqual(failed);
    expect(failed._tag === "UnitResolved" && failed.failure?.detail).toBe(REFUSED);
  });

  it("states nothing about failure for a unit that settled as planned", () => {
    const resolved = authoredLog(unitsOf(1, [])).filter((event) => event._tag === "UnitResolved");
    for (const event of resolved) {
      expect(event._tag === "UnitResolved" && event.failure).toBeUndefined();
    }
  });
});
