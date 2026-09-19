import type { Doc } from "../../screen/doc.js";
import { initialInputState, inputDoc } from "../../screen/ask/input.js";
import { instructionFileName } from "./samples/instruction-source-asks.js";

/**
 * A typed line before anything is typed, showing its placeholder behind the
 * caret (canvas *Direction: Ledger*, board `Ledger-grammar`, frame *input*).
 */
export const ledgerGrammarInput: Doc = inputDoc(instructionFileName, initialInputState);
