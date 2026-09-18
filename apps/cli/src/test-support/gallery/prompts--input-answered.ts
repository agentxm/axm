import type { Doc } from "../../screen/doc.js";
import { initialInputState, inputAnswer, inputDoc } from "../../screen/ask/input.js";
import { instructionFileName } from "./instruction-source-asks.js";

/**
 * A typed line before anything is typed, showing its placeholder behind the
 * caret, and the one line it leaves once it is answered (canvas *Direction:
 * Ledger*, board `Ledger-setup-play`, frame *other*; board `Ledger-grammar`,
 * frames *input* and *answered*).
 */
export const promptsInputAnswered: Doc = [
  ...inputDoc(instructionFileName, initialInputState),
  { _tag: "blank" },
  ...inputAnswer(instructionFileName, "docs/AGENTS.md"),
];
