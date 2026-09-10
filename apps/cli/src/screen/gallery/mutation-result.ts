import type { Doc, RowNode } from "../doc.js";

/** Settled result of an apply: units as change rows with per-agent children. */

export const mutationRows: ReadonlyArray<RowNode> = [
  {
    _tag: "row",
    change: "create",
    cells: [
      "@craigsmitham/effect-v4",
      "0.4.2",
      "created",
      "14 files",
      "agent_extensions/agentxm/@craigsmitham/skills/effect-v4",
    ],
    children: [
      {
        _tag: "paragraph",
        tone: "dim",
        text: "claude-code: projected at .claude/skills/effect-v4 — rendered",
      },
      {
        _tag: "paragraph",
        tone: "dim",
        text: "codex: projected at .codex/skills/effect-v4 — rendered",
      },
    ],
  },
  {
    _tag: "row",
    change: "update",
    cells: [
      "@craigsmitham/field-notes",
      "0.2.3 → 0.2.4",
      "updated",
      "6 files",
      "agent_extensions/agentxm/@craigsmitham/skills/field-notes",
    ],
    children: [
      {
        _tag: "paragraph",
        tone: "warn",
        text: "cursor: blocked at .cursor/skills/field-notes — hand-authored file at the target path",
      },
    ],
  },
  {
    _tag: "row",
    change: "remove",
    cells: [
      "@agentxm/knowledge/legacy",
      "1.0.0",
      "removed",
      "agent_extensions/agentxm/@agentxm/knowledge/legacy",
    ],
  },
];

export const mutationResult: Doc = [
  { _tag: "headline", tone: "ok", text: "Installed 3 skills", aside: "2.4s" },
  { _tag: "rows", rows: mutationRows },
  {
    _tag: "collapsed",
    change: "unchanged",
    count: 5,
    noun: "skills already current",
    hint: "--verbose to list",
  },
  {
    _tag: "section",
    title: "1 warning",
    children: [
      {
        _tag: "callout",
        tone: "warn",
        title: "Skill package pins a pre-release Effect version",
        children: [{ _tag: "paragraph", tone: "dim", text: "@craigsmitham/effect-v4" }],
      },
    ],
  },
  { _tag: "paragraph", tone: "dim", text: "Agents: claude-code, codex, cursor" },
  {
    _tag: "next",
    actions: [
      { description: "Inspect installed skills", cmd: "axm skills list" },
      { description: "Resolve the blocked cursor projection", cmd: "axm sync --agent cursor" },
    ],
  },
];
