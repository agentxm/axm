import type { Doc, RowNode } from "../../screen/doc.js";
import type { TerminalSize } from "./fixture.js";

interface Unit {
  readonly name: string;
  readonly version: string;
}

interface RunningUnit extends Unit {
  readonly measure: string;
}

const done = 3;

const running: ReadonlyArray<RunningUnit> = [
  { name: "@acme/skills/changelog", version: "0.3.0", measure: "40 KB / 96 KB" },
  { name: "@acme/skills/release-notes", version: "1.1.0", measure: "12 KB / 30 KB" },
];

const waiting: ReadonlyArray<Unit> = [
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

const total = done + running.length + waiting.length;

/** Rows the scene keeps outside the ledger window: title, fold line, status, the wait, and the blanks between them. */
const fixedRows = 8;

/**
 * A publish of 40 extensions at a short terminal height, with a browser
 * authorization wait beneath the ledger (canvas *Width and height*, board
 * `Width-live`, frame *Height cap*). The window keeps running rows first, then
 * the next waiting rows, and folds the rest; the wait keeps its minimum.
 *
 * The ledger is drawn with change rows until the ledger node exists, and the
 * window is fitted here until the Frame fits scenes; both then replace this
 * fixture's own layout without changing its snapshots' intent.
 */
export const widthLiveHeightCap = (terminal: TerminalSize): Doc => {
  // Below 60 columns a row keeps only its name, its mark still telling running from
  // waiting, and the wait keeps a title short enough for one line behind the gutter.
  const wide = terminal.columns >= 60;
  const window = Math.max(0, terminal.rows - 2 - fixedRows);
  const shownRunning = running.slice(0, window);
  const shownWaiting = waiting.slice(0, window - shownRunning.length);
  const rows: ReadonlyArray<RowNode> = [
    ...shownRunning.map((unit): RowNode => ({
      _tag: "row",
      change: "update",
      cells: wide ? [unit.name, unit.version, "uploading", unit.measure] : [unit.name],
    })),
    ...shownWaiting.map((unit): RowNode => ({
      _tag: "row",
      change: "unchanged",
      cells: wide ? [unit.name, unit.version, "waiting"] : [unit.name],
    })),
  ];
  return [
    { _tag: "headline", tone: "neutral", text: [{ text: "Publishing as @acme", bold: true }] },
    { _tag: "blank" },
    { _tag: "rows", rows },
    {
      _tag: "paragraph",
      tone: "dim",
      text: `… ${String(waiting.length - shownWaiting.length)} more waiting, ${String(done)} done`,
    },
    { _tag: "blank" },
    {
      _tag: "paragraph",
      tone: "dim",
      text: `publishing ${String(done + running.length)} of ${String(total)} in 8.2s`,
    },
    { _tag: "blank" },
    {
      _tag: "callout",
      tone: "info",
      title: wide ? "Authorize the publish in your browser" : "Authorize in your browser",
      children: [{ _tag: "paragraph", tone: "dim", text: "expires in 9:41, esc cancels" }],
    },
  ];
};
