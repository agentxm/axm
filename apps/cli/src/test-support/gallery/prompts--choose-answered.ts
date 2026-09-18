import type { Doc } from "../../screen/doc.js";
import { chooseAnswer, chooseDoc, initialChooseState } from "../../screen/ask/choose.js";
import { agentsSource, instructionSource } from "./instruction-source-asks.js";

/**
 * A list open under its question with the caret on the recommended file, and
 * the one line it leaves once it is answered (canvas *Direction: Ledger*,
 * board `Ledger-grammar`, frames *choose one* and *answered*).
 */
export const promptsChooseAnswered: Doc = [
  ...chooseDoc(instructionSource, initialChooseState(instructionSource), 24),
  { _tag: "blank" },
  ...chooseAnswer(instructionSource, agentsSource),
];
