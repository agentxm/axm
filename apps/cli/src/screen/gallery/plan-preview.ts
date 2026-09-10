import type { Doc } from "../doc.js";

/** A dry run: what apply would do, its risks, and the readiness summary. */
export const planPreview: Doc = [
  { _tag: "headline", tone: "warn", text: "Would install 3 skills" },
  {
    _tag: "paragraph",
    text: "Install skills requested on the command line into the project workspace",
  },
  {
    _tag: "rows",
    rows: [
      {
        _tag: "row",
        change: "create",
        cells: [
          "@craigsmitham/effect-v4",
          "0.4.2",
          "create",
          "14 files",
          "agent_extensions/agentxm/@craigsmitham/skills/effect-v4",
        ],
        children: [
          {
            _tag: "paragraph",
            tone: "dim",
            text: "claude-code: will project — .claude/skills/effect-v4",
          },
          { _tag: "paragraph", tone: "dim", text: "codex: will project — .codex/skills/effect-v4" },
        ],
      },
      {
        _tag: "row",
        change: "update",
        cells: [
          "@craigsmitham/field-notes",
          "0.2.3 → 0.2.4",
          "update",
          "6 files",
          "agent_extensions/agentxm/@craigsmitham/skills/field-notes",
        ],
        children: [
          {
            _tag: "paragraph",
            tone: "warn",
            text: "cursor: blocked — hand-authored file at .cursor/skills/field-notes",
          },
        ],
      },
      {
        _tag: "row",
        change: "blocked",
        cells: ["@agentxm/knowledge/legacy", "1.0.0", "requires a newer AXM (>= 0.30.0)"],
      },
    ],
  },
  {
    _tag: "callout",
    tone: "warn",
    title:
      "@craigsmitham/effect-v4@0.4.2 was published 3 hours ago, inside the 24 hour minimum release age",
  },
  {
    _tag: "summary",
    parts: [{ text: "2 to install" }, { text: "2 warnings" }, { text: "1 error" }],
  },
];
