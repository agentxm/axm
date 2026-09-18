import type { Doc } from "../../screen/doc.js";

/**
 * A settled result at verbose level (*Reference cases*, board `2 · Sync,
 * update, uninstall`, frame *update --verbose — per-agent outcomes are row
 * children, aligned to the content column*).
 *
 * The row states what happened to the extension; what each configured agent
 * did with it belongs beneath that row, not beside it, so the ledger stays
 * one line per unit at every verbosity. The agent that could not take the
 * change is the one that carries a tone.
 */
export const refSyncVerboseChildren: Doc = [
  {
    _tag: "headline",
    tone: "neutral",
    text: [{ text: "Updating", bold: true }],
    aside: [{ text: "in this project" }, { text: "agents: claude-code, codex, cursor" }],
  },
  { _tag: "blank" },
  {
    _tag: "ledger",
    columns: [
      { header: "Skill", role: "name" },
      { header: "Version", role: "fixed", priority: "preferred" },
      { header: "Status", role: "fixed", priority: "required" },
      { header: "Detail", role: "elastic", priority: "optional" },
    ],
    rows: [
      {
        id: "@acme/skills/triage",
        mark: "update",
        cells: ["@acme/skills/triage", "2.0.1", "updated", "from 1.9.4, 8 files"],
        children: [
          {
            _tag: "paragraph",
            tone: "dim",
            text: "claude-code: projected at .claude/skills/triage",
          },
          { _tag: "paragraph", tone: "dim", text: "codex: projected at .agents/skills/triage" },
          {
            _tag: "paragraph",
            tone: "warn",
            text: "cursor: not supported by this agent, skills are unavailable at project scope",
          },
        ],
      },
    ],
  },
  { _tag: "blank" },
  {
    _tag: "headline",
    tone: "ok",
    text: [{ text: "Updated 1 skill", bold: true }],
    aside: [{ text: "1 applied" }],
  },
];
