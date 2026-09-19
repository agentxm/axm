import type { Doc } from "../../screen/doc.js";
import { chooseDoc, initialChooseState } from "../../screen/ask/choose.js";
import { instructionSource } from "./samples/instruction-source-asks.js";
import { syncAnswered } from "./samples/setup-records.js";

/** The source list open under the answers so far (board `Ledger-setup-play`, frame *source*). */
export const ledgerSetupPlaySource: Doc = [
  ...syncAnswered(true),
  ...chooseDoc(instructionSource, initialChooseState(instructionSource), 12),
];
