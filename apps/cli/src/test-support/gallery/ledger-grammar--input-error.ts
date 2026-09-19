import type { Doc } from "../../screen/doc.js";
import { inputDoc } from "../../screen/ask/input.js";
import { instructionFileName } from "./samples/instruction-source-asks.js";

/**
 * A typed line its question refused: what was typed stays behind the caret,
 * and the reason stands beneath it in the attention mark until the next edit.
 */
export const ledgerGrammarInputError: Doc = inputDoc(instructionFileName, {
  raw: "/etc/AGENTS.md",
  problem: "Enter a path relative to the project root.",
});
