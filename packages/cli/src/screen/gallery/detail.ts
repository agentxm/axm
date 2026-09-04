import type { Doc } from "../doc.js";

/** Inspect one extension: identity fields, a per-agent table, next actions. */
export const detail: Doc = [
  { _tag: "headline", tone: "neutral", text: "@craigsmitham/effect-v4", aside: "skill" },
  {
    _tag: "fields",
    fields: [
      { label: "Version", value: "0.4.2" },
      { label: "Source", value: "registry (https://registry.axm.sh/@craigsmitham/effect-v4)" },
      { label: "Owner", value: [{ text: "@craigsmitham", link: "https://axm.sh/@craigsmitham" }] },
      { label: "Installed at", value: "agent_extensions/agentxm/@craigsmitham/skills/effect-v4" },
      {
        label: "Description",
        value:
          "Checklists to consult when designing, implementing, maintaining, or reviewing Effect v4 TypeScript.",
      },
      { label: "Activation", value: [{ text: "enabled", tone: "ok" }] },
    ],
  },
  { _tag: "blank" },
  {
    _tag: "table",
    caption: "Agents",
    columns: [
      { header: "Agent", priority: "required" },
      { header: "Status" },
      { header: "Path", priority: "optional" },
      { header: "Detail", priority: "optional" },
    ],
    rows: [
      ["claude-code", [{ text: "projected", tone: "ok" }], ".claude/skills/effect-v4", "current"],
      ["codex", [{ text: "projected", tone: "ok" }], ".codex/skills/effect-v4", "current"],
      [
        "cursor",
        [{ text: "blocked", tone: "warn" }],
        ".cursor/skills/effect-v4",
        "hand-authored file at the target path; run `axm adopt` or move it",
      ],
    ],
  },
  {
    _tag: "next",
    actions: [
      { description: "Update to the latest version", cmd: "axm update @craigsmitham/effect-v4" },
      { description: "Read the package page", url: "https://axm.sh/@craigsmitham/effect-v4" },
    ],
  },
];
