import type { ConfirmAsk } from "../../../screen/ask/ask.js";

/** The review gate the canvas draws at three widths: three lettered choices, the safe one first. */
export const applyChangesGate: ConfirmAsk<"declined" | "approved" | "details"> = {
  _tag: "Confirm",
  question: "Apply 4 changes?",
  label: "Apply changes",
  choices: [
    { key: "n", word: "no", value: "declined" },
    { key: "y", word: "yes", value: "approved" },
    { key: "d", word: "details", value: "details" },
  ],
};

/** Setup's question whether to sync instructions, with the note it stands open with. */
export const syncInstructions: ConfirmAsk<boolean> = {
  _tag: "Confirm",
  question: "Sync instructions to the selected agents?",
  note: "Updates agent instruction files such as AGENTS.md and CLAUDE.md.",
  label: "Sync instructions",
  choices: [
    { key: "y", word: "yes", value: true },
    { key: "n", word: "no", value: false },
  ],
};
