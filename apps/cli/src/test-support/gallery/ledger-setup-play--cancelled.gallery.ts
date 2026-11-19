import type { Doc } from "../../screen/doc.js";
import { setupResultDoc } from "../../root/setup/view.js";
import { cancelledOutcome, setupOpening } from "./samples/setup-records.js";
import { galleryModule } from "./fixture.js";

/**
 * A setup the person stopped: the verdict stands alone and says nothing was
 * changed (board `Ledger-setup-play`, frame *cancelled*).
 */
const ledgerSetupPlayCancelled: Doc = [
  ...setupOpening(),
  ...setupResultDoc(cancelledOutcome, {
    verbosity: "normal",
    suggestions: [],
    displayDirectory: (directory) => directory,
  }),
];

export default galleryModule({
  _tag: "document",
  name: "ledger-setup-play--cancelled",
  doc: ledgerSetupPlayCancelled,
});
