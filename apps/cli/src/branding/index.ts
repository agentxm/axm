import type { Doc } from "../screen/index.js";

/** The masthead root help opens with: wordmark, tagline, and the product sites. */
export const brandingDoc: Doc = [
  { _tag: "raw", content: "▄▀█ ▀▄▀ █▀▄▀█\n█▀█ █ █ █ ▀ █" },
  {
    _tag: "paragraph",
    text: [{ text: "Agent Extension Manager " }, { text: "by Agent", tone: "dim" }, { text: "XM" }],
  },
  { _tag: "blank" },
  {
    _tag: "paragraph",
    text: [
      { text: "https://axm.sh", copyable: true },
      { text: " | " },
      { text: "https://agentxm.ai", copyable: true },
    ],
  },
];
