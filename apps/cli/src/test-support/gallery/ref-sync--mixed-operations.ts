import type { Doc } from "../../screen/doc.js";

/**
 * A preview whose units do not all change the same way (*Reference cases*,
 * board `2 · Sync, update, uninstall`, frame *sync --preview — mixed
 * operations in one ledger; unchanged rows fold*).
 *
 * One ledger carries all four marks, so a reader sees the shape of the whole
 * change at once: two installs, one update, one removal, and the twelve units
 * that were already current folded into one line with the flag that lists
 * them. The verdict claims only what would change; the counts sit in its
 * aside, and `nothing was written` says a preview wrote nothing.
 */
export const refSyncMixedOperations: Doc = [
  {
    _tag: "headline",
    tone: "neutral",
    text: [{ text: "Previewing sync", bold: true }],
    aside: "in this project, agents: claude-code, codex",
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
        id: "@acme/skills/standup",
        mark: "create",
        cells: ["@acme/skills/standup", "0.4.2", "install", "declared in axm.json"],
      },
      {
        id: "github",
        mark: "create",
        cells: ["github", "—", "install", "mcp, 2 agent configs"],
      },
      {
        id: "@acme/skills/triage",
        mark: "update",
        cells: ["@acme/skills/triage", "2.0.1", "update", "from 1.9.4, lockfile"],
      },
      {
        id: "@legacy/skills/changelog",
        mark: "remove",
        cells: ["@legacy/skills/changelog", "0.3.0", "remove", "no longer declared"],
      },
    ],
    folded: {
      mark: "unchanged",
      count: 12,
      noun: "extensions already current",
      hint: "--verbose to list",
    },
  },
  { _tag: "blank" },
  {
    _tag: "headline",
    tone: "neutral",
    text: [{ text: "Would sync 4 extensions", bold: true }],
    aside: "4 to sync, 12 already current, nothing was written",
  },
  { _tag: "blank" },
  { _tag: "next", actions: [{ description: "apply these changes", cmd: "axm sync" }] },
];
