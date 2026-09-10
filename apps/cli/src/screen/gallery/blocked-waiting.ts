import type { Doc } from "../doc.js";

/** An operation blocked by workspace contention, plus the waiting notice it followed. */
export const blockedWaiting: Doc = [
  {
    _tag: "callout",
    tone: "warn",
    title: "Waiting — another operation holds the workspace (axm sync, pid 48213)",
  },
  { _tag: "blank" },
  {
    _tag: "headline",
    tone: "warn",
    text: "Install is blocked — another operation holds the workspace",
  },
  {
    _tag: "paragraph",
    text: "axm sync (pid 48213) has held the workspace transition for 30 seconds; nothing was attempted.",
  },
  {
    _tag: "rows",
    rows: [
      {
        _tag: "row",
        change: "blocked",
        cells: ["@craigsmitham/effect-v4", "not attempted: the workspace is held"],
      },
      {
        _tag: "row",
        change: "blocked",
        cells: ["@craigsmitham/field-notes", "not attempted: the workspace is held"],
      },
    ],
  },
  {
    _tag: "next",
    actions: [
      { description: "Wait for the other operation, then rerun", cmd: "axm install" },
      { description: "Inspect the holder", cmd: "axm lint --workspace" },
    ],
  },
];
