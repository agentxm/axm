import type { Doc } from "../../screen/doc.js";
import { initialInputState, inputDoc } from "../../screen/ask/input.js";
import { instructionFileName } from "./instruction-source-asks.js";
import { syncAnswered } from "./setup-records.js";

/**
 * A source file the list did not offer, typed on one line (board
 * `Ledger-setup-play`, frame *other filename*).
 */
export const ledgerSetupPlayOther: Doc = [
  ...syncAnswered(true),
  ...inputDoc(instructionFileName, initialInputState),
];
