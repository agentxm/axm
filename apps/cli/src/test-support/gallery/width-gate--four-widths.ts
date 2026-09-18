import type { Doc } from "../../screen/doc.js";

/**
 * One gate's plan ledger at the four widths the design canvas draws it at
 * (*Width and height*, board `Width-gate`, frames *100 columns*, *80 columns*,
 * *60 to 79 columns*, *under 60 columns*).
 *
 * The columns carry the roles the canvas depends on: a required protected
 * name, a fixed preferred version, a fixed required plan, and an optional
 * elastic detail. Spare width flows to the detail, the detail drops first, and
 * the rows stack once the columns that are left no longer fit.
 *
 * The gate's own question belongs to the prompt work; the ledger and the
 * condition above it are what this fixture holds.
 */
export const widthGateFourWidths: Doc = [
  {
    _tag: "headline",
    tone: "neutral",
    text: [{ text: "Previewing install", bold: true }],
    aside: [{ text: "into this project" }, { text: "for claude-code and codex" }],
  },
  { _tag: "blank" },
  {
    _tag: "ledger",
    columns: [
      { header: "Extension", role: "name" },
      { header: "Version", role: "fixed", priority: "preferred" },
      { header: "Plan", role: "fixed", priority: "required" },
      { header: "Detail", role: "elastic", priority: "optional" },
    ],
    rows: [
      {
        id: "@acme/skills/code-review",
        mark: "create",
        cells: ["@acme/skills/code-review", "1.4.0", "install", "42 files, 380 KB"],
      },
      {
        id: "@acme/subagents/reviewer",
        mark: "create",
        cells: ["@acme/subagents/reviewer", "0.9.0", "install", "3 files, 4 KB"],
      },
      {
        id: "@acme/packs/review-kit",
        mark: "create",
        cells: ["@acme/packs/review-kit", "2.1.0", "install", "after its 2 members"],
      },
      {
        id: "@acme/skills/triage",
        mark: "update",
        cells: ["@acme/skills/triage", "2.0.1", "update", "from 1.9.4, 8 files"],
      },
    ],
  },
  { _tag: "blank" },
  {
    _tag: "callout",
    tone: "warn",
    title: "Publisher identity changed for @acme/skills/triage",
  },
];
