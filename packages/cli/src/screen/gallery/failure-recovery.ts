import type { Doc } from "../doc.js";

/** A failed apply that rolled back, with retained state and a recovery route. */
export const failureRecovery: Doc = [
  {
    _tag: "headline",
    tone: "error",
    text: "Failed to install 3 skills — all changes rolled back",
  },
  {
    _tag: "paragraph",
    tone: "error",
    text: "Registry returned 502 Bad Gateway for @craigsmitham/effect-v4@0.4.2 after 3 attempts (network)",
  },
  {
    _tag: "rows",
    rows: [
      {
        _tag: "row",
        change: "rolled-back",
        cells: ["@craigsmitham/field-notes", "0.2.4", "rolled back", "effects were restored"],
      },
      {
        _tag: "row",
        change: "failed",
        cells: [
          "@craigsmitham/effect-v4",
          "0.4.2",
          "failed",
          "Registry returned 502 Bad Gateway (network)",
        ],
      },
      {
        _tag: "row",
        change: "blocked",
        cells: ["@agentxm/knowledge/agentxm", "blocked", "not attempted: an earlier step failed"],
      },
    ],
  },
  {
    _tag: "callout",
    tone: "warn",
    title: "Snapshots kept at /tmp/axm-snapshots/2026-09-03T18-12-41Z",
    children: [
      {
        _tag: "paragraph",
        text: "The workspace was restored from them; delete the directory once you have confirmed the workspace state.",
      },
    ],
  },
  {
    _tag: "next",
    actions: [
      {
        description: "Retry once the registry is reachable",
        cmd: "axm install @craigsmitham/effect-v4",
      },
      { description: "Check registry status", url: "https://status.axm.sh" },
      {
        description: "Report the failure with diagnostics",
        cmd: "axm install @craigsmitham/effect-v4 --debug",
      },
    ],
  },
];
