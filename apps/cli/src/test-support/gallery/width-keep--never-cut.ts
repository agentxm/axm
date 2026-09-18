import type { Doc } from "../../screen/doc.js";

/**
 * What a person copies is never cut (*Width and height*, board
 * `Width — never cut, never pad`, frame *What people copy is never cut*, drawn
 * at 60 columns).
 *
 * The authorization URL and the `next` command are both longer than the width.
 * Each takes a line of its own and overflows it whole, so a copy out of the
 * terminal still resolves and still runs: the painter never wraps, splits, or
 * ellipsizes a copyable value.
 */
export const widthKeepNeverCut: Doc = [
  {
    _tag: "callout",
    tone: "info",
    title: "Waiting for your approval in the browser",
    children: [
      {
        _tag: "paragraph",
        text: [
          { text: "https://agentxm.ai/auth/publish-requests/pubreq_8f3k2q7d1m4x", copyable: true },
        ],
      },
    ],
  },
  { _tag: "blank" },
  {
    _tag: "next",
    actions: [
      {
        description: "Install the reviewed extension",
        cmd: "axm install @acme-enterprise/skills/soc2-evidence-review --yes",
      },
    ],
  },
];
