import type { Doc } from "../../screen/doc.js";
import { confirmDoc, initialConfirmState } from "../../screen/ask/confirm.js";
import { agentsAnswered, syncAsk } from "./samples/setup-records.js";

/**
 * The agents answered as one line, and the sync question beneath it (board
 * `Ledger-setup-play`, frame *sync confirm*).
 */
export const ledgerSetupPlaySync: Doc = [
  ...agentsAnswered,
  ...confirmDoc(syncAsk, initialConfirmState),
];
