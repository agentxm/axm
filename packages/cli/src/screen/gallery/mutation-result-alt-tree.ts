import type { Doc } from "../doc.js";

/**
 * Alternative: the same settled result as a tree, units as roots and agent
 * projections as leaves. Kept for side-by-side review; the accepted rendering
 * is `mutation-result` (change rows with children).
 */
export const mutationResultAltTree: Doc = [
  { _tag: "headline", tone: "ok", text: "Installed 3 skills", aside: "2.4s" },
  {
    _tag: "tree",
    roots: [
      {
        text: [{ text: "+ " }, { text: "@craigsmitham/effect-v4", bold: true }, { text: " 0.4.2" }],
        detail: "created, 14 files",
        children: [
          { text: "claude-code", detail: "projected at .claude/skills/effect-v4" },
          { text: "codex", detail: "projected at .codex/skills/effect-v4" },
        ],
      },
      {
        text: [
          { text: "~ " },
          { text: "@craigsmitham/field-notes", bold: true },
          { text: " 0.2.3 → 0.2.4" },
        ],
        detail: "updated, 6 files",
        children: [
          {
            text: [{ text: "cursor", tone: "warn" }],
            detail: "blocked — hand-authored file at .cursor/skills/field-notes",
          },
        ],
      },
      {
        text: [
          { text: "- " },
          { text: "@agentxm/knowledge/legacy", bold: true },
          { text: " 1.0.0" },
        ],
        detail: "removed",
      },
    ],
  },
  {
    _tag: "collapsed",
    change: "unchanged",
    count: 5,
    noun: "skills already current",
    hint: "--verbose to list",
  },
  {
    _tag: "next",
    actions: [{ description: "Inspect installed skills", cmd: "axm skills list" }],
  },
];
