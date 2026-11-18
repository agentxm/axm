import type { Doc } from "../screen/index.js";

/**
 * The masthead root help opens with: the wordmark and its tagline as one
 * group, and the product sites as the next.
 */
export const brandingDoc: Doc = [
  {
    _tag: "section",
    children: [
      { _tag: "raw", content: "▄▀█ ▀▄▀ █▀▄▀█\n█▀█ █ █ █ ▀ █" },
      {
        _tag: "paragraph",
        text: [
          { text: "Agent Extension Manager " },
          { text: "by Agent", tone: "dim" },
          { text: "XM" },
        ],
      },
    ],
  },
  {
    _tag: "section",
    children: [
      {
        _tag: "paragraph",
        text: [
          { text: "https://axm.sh", copyable: true },
          { text: " | " },
          { text: "https://agentxm.ai", copyable: true },
        ],
      },
    ],
  },
];
