import type { Doc } from "../../screen/doc.js";
import { setupResultDoc } from "../../root/setup/view.js";
import { cancelledOutcome, setupOpening } from "./samples/setup-records.js";

/**
 * A setup the person stopped: the verdict stands alone and says nothing was
 * changed (board `Ledger-setup-play`, frame *cancelled*).
 */
export const ledgerSetupPlayCancelled: Doc = [
  ...setupOpening(),
  ...setupResultDoc(cancelledOutcome, {
    verbosity: "normal",
    suggestions: [],
    displayDirectory: (directory) => directory,
  }),
];
