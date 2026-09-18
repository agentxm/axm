import type { Doc } from "../../screen/doc.js";
import { liveLedgerDoc, type LivePlan } from "../../screen/live-ledger.js";
import { initialProgress, reduceProgress, type ProgressState } from "../../screen/progress.js";
import type { TerminalSize } from "../../screen/scene.js";
import type { OperationEvent } from "@agentxm/workspace/transitions/planning";

const STARTED_AT = 1_000;
const NOW = STARTED_AT + 8_200;

interface Unit {
  readonly name: string;
  readonly version: string;
}

const units: ReadonlyArray<Unit> = [
  { name: "@acme/skills/standup", version: "1.4.0" },
  { name: "@acme/skills/handoff", version: "2.1.0" },
  { name: "@acme/subagents/scout", version: "0.8.0" },
  { name: "@acme/skills/changelog", version: "0.3.0" },
  { name: "@acme/skills/release-notes", version: "1.1.0" },
  { name: "@acme/skills/retro", version: "0.2.0" },
  { name: "@acme/subagents/reviewer", version: "0.9.0" },
  { name: "@acme/skills/triage", version: "0.5.1" },
  { name: "@acme/skills/incident-review", version: "2.0.0" },
  { name: "@acme/subagents/planner", version: "0.1.4" },
  { name: "@acme/skills/api-docs", version: "1.3.2" },
  { name: "@acme/skills/migrations", version: "0.7.0" },
  { name: "@acme/rules/typescript", version: "3.1.0" },
  { name: "@acme/skills/benchmarks", version: "0.2.9" },
  { name: "@acme/hooks/pre-commit", version: "1.0.3" },
  { name: "@acme/skills/on-call", version: "0.4.0" },
  { name: "@acme/knowledge/runbooks", version: "5.2.0" },
  ...Array.from({ length: 23 }, (_, index) => ({
    name: `@acme/skills/team-${String(index + 1).padStart(2, "0")}`,
    version: "0.1.0",
  })),
];

/** The three units already published, and the two the registry is taking now. */
const DONE = 3;
const RUNNING = 2;

const unitId = (unit: Unit): string => `extension:${unit.name}`;

/**
 * The publication as it stands eight seconds in: three units settled, two
 * uploading with a measure each, and the rest waiting their turn.
 */
const publishLog: ReadonlyArray<OperationEvent> = [
  {
    _tag: "OperationStarted",
    seq: 1,
    atMs: STARTED_AT,
    operationId: "publish-1",
    name: "Publishing",
    mode: "apply",
  },
  { _tag: "PhaseStarted", seq: 2, atMs: STARTED_AT + 1, phase: "apply" },
  ...units.slice(0, DONE).flatMap((unit, index): ReadonlyArray<OperationEvent> => [
    {
      _tag: "UnitStarted",
      seq: 3 + index * 2,
      atMs: STARTED_AT + 10 + index,
      unitId: unitId(unit),
      label: unit.name,
      index,
    },
    {
      _tag: "UnitResolved",
      seq: 4 + index * 2,
      atMs: STARTED_AT + 100 + index,
      unitId: unitId(unit),
      label: unit.name,
      state: "committed",
      index,
    },
  ]),
  ...units.slice(DONE, DONE + RUNNING).flatMap((unit, index): ReadonlyArray<OperationEvent> => [
    {
      _tag: "UnitStarted",
      seq: 20 + index * 2,
      atMs: STARTED_AT + 5_000 + index,
      unitId: unitId(unit),
      label: unit.name,
      index: DONE + index,
    },
    {
      _tag: "UnitProgress",
      seq: 21 + index * 2,
      atMs: STARTED_AT + 6_000 + index,
      unitId: unitId(unit),
      done: index === 0 ? 40_000 : 12_000,
      total: index === 0 ? 96_000 : 30_000,
      unit: "bytes",
    },
  ]),
];

const state: ProgressState = publishLog.reduce(reduceProgress, initialProgress);

const plan: LivePlan = {
  title: "Publishing as @acme",
  columns: [
    { header: "Extension", role: "name" },
    { header: "Version", role: "fixed", priority: "optional" },
  ],
  rows: units.map((unit) => ({
    id: unitId(unit),
    plannedMark: "create",
    plannedStatus: "publish",
    cells: [unit.name, unit.version],
  })),
  hint: "--verbose for details",
};

/**
 * A publish of forty extensions at a short terminal height (canvas *Width and
 * height*, board `Width-live`, frame *Height cap*). The live ledger keeps the
 * running rows first, then the next waiting rows, and folds the rest into one
 * line; the status line beneath it survives every squeeze.
 *
 * The wait that sits beneath the ledger on the canvas belongs to the scene's
 * interaction part, which the `Screen.wait` primitive owns, so this fixture is
 * the ledger part alone and is given the whole height the scene would share.
 */
export const widthLiveHeightCap = (terminal: TerminalSize): Doc =>
  liveLedgerDoc(state, { plan, rows: terminal.rows - 2, nowMs: NOW });
