import type { Doc } from "../../screen/doc.js";
import { confirmAnswer, confirmDoc } from "../../screen/ask/confirm.js";
import type { ConfirmAsk } from "../../screen/ask/ask.js";

const sync: ConfirmAsk<boolean> = {
  _tag: "Confirm",
  question: "Sync instructions to the selected agents?",
  note: "Updates agent instruction files such as AGENTS.md and CLAUDE.md.",
  label: "Sync instructions",
  choices: [
    { key: "y", word: "yes", value: true },
    { key: "n", word: "no", value: false },
  ],
};

/**
 * A question with a note while it stands open, and the one line it leaves once
 * it is answered (canvas *Direction: Ledger*, board `Ledger-grammar`, frames
 * *confirm and gate* and *answered*).
 */
export const promptsConfirmAnswered: Doc = [
  ...confirmDoc(sync, { index: 0 }),
  { _tag: "blank" },
  ...confirmAnswer(sync, sync.choices[0] ?? { key: "y", word: "yes", value: true }),
];
