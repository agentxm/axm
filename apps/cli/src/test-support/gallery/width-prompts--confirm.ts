import type { Doc } from "../../screen/doc.js";
import { confirmDoc, initialConfirmState } from "../../screen/ask/confirm.js";
import type { ConfirmAsk } from "../../screen/ask/ask.js";

const gate: ConfirmAsk<"declined" | "approved" | "details"> = {
  _tag: "Confirm",
  question: "Apply 4 changes?",
  label: "Apply changes",
  choices: [
    { key: "n", word: "no", value: "declined" },
    { key: "y", word: "yes", value: "approved" },
    { key: "d", word: "details", value: "details" },
  ],
};

/**
 * The review gate at the three widths the canvas draws it at (*Width and
 * height*, board `Width-prompts`): the question and its chips on one line, the
 * chips on their own line, and the chips without their words.
 */
export const widthPromptsConfirm: Doc = confirmDoc(gate, initialConfirmState);
