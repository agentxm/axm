import type { Doc } from "../../screen/doc.js";
import { initialInputState, inputDoc } from "../../screen/ask/input.js";
import { instructionFileName } from "./samples/instruction-source-asks.js";
import { syncAnswered } from "./samples/setup-records.js";

/**
 * A source file the list did not offer, typed on one line (board
 * `Ledger-setup-play`, frame *other filename*).
 */
export const ledgerSetupPlayOther: Doc = [
  ...syncAnswered(true),
  ...inputDoc(instructionFileName, initialInputState),
];
