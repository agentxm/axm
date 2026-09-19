import type { Doc } from "../../screen/doc.js";
import { confirmDoc } from "../../screen/ask/confirm.js";
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
 * A question with a note while it stands open (canvas *Direction: Ledger*,
 * board `Ledger-grammar`, frame *confirm and gate*).
 */
export const ledgerGrammarConfirmAndGate: Doc = confirmDoc(sync, { index: 0 });
