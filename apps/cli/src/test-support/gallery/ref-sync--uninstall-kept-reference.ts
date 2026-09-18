import type { Doc } from "../../screen/doc.js";

/**
 * An uninstall that left something behind (*Reference cases*, board `2 ·
 * Sync, update, uninstall`, frame *uninstall — removals, and a reference that
 * survives them*).
 *
 * Two units were removed and one was kept because it is declared in its own
 * right, so the kept unit stays on the ledger with an `=` rather than
 * disappearing into a fold. What AXM observed but does not own follows the
 * ledger as a callout, because it is context for the outcome rather than a
 * unit of it.
 */
export const refSyncUninstallKeptReference: Doc = [
  {
    _tag: "headline",
    tone: "neutral",
    text: [{ text: "Uninstalling", bold: true }],
    aside: [{ text: "in this project" }, { text: "agents: claude-code, codex" }],
  },
  { _tag: "blank" },
  {
    _tag: "ledger",
    columns: [
      { header: "Extension", role: "name" },
      { header: "Version", role: "fixed", priority: "preferred" },
      { header: "Status", role: "fixed", priority: "required" },
      { header: "Detail", role: "elastic", priority: "optional" },
    ],
    rows: [
      {
        id: "@acme/packs/review-kit",
        mark: "remove",
        cells: ["@acme/packs/review-kit", "2.1.0", "removed"],
      },
      {
        id: "@acme/subagents/reviewer",
        mark: "remove",
        cells: ["@acme/subagents/reviewer", "0.9.0", "removed", "1 file"],
      },
      {
        id: "@acme/skills/code-review",
        mark: "unchanged",
        cells: ["@acme/skills/code-review", "1.4.0", "not selected", "also declared directly"],
      },
    ],
  },
  { _tag: "blank" },
  {
    _tag: "callout",
    tone: "warn",
    title: "AXM will not touch 1 path",
    children: [
      {
        _tag: "paragraph",
        tone: "dim",
        text: "AGENTS.md — prose AXM did not write still mentions @acme/subagents/reviewer",
      },
    ],
  },
  { _tag: "blank" },
  {
    _tag: "headline",
    tone: "ok",
    text: [{ text: "Uninstalled 2 extensions", bold: true }],
    aside: [{ text: "2 applied" }, { text: "1 not selected" }],
  },
];
