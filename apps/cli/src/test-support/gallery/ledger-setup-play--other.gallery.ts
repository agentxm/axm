import type { Doc } from "../../screen/doc.js";
import { initialInputState, inputDoc } from "../../screen/ask/input.js";
import { instructionFileName } from "./samples/instruction-source-asks.js";
import { syncAnswered } from "./samples/setup-records.js";
import { galleryModule } from "./fixture.js";

/**
 * A source file the list did not offer, typed on one line (board
 * `Ledger-setup-play`, frame *other filename*).
 */
const ledgerSetupPlayOther: Doc = [
  ...syncAnswered(true),
  ...inputDoc(instructionFileName, initialInputState),
];

export default galleryModule({
  _tag: "document",
  name: "ledger-setup-play--other",
  doc: ledgerSetupPlayOther,
});
