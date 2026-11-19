import type { Doc } from "../../screen/doc.js";
import { chooseDoc, initialChooseState } from "../../screen/ask/choose.js";
import { instructionSource } from "./samples/instruction-source-asks.js";
import { syncAnswered } from "./samples/setup-records.js";
import { galleryModule } from "./fixture.js";

/** The source list open under the answers so far (board `Ledger-setup-play`, frame *source*). */
const ledgerSetupPlaySource: Doc = [
  ...syncAnswered(true),
  ...chooseDoc(instructionSource, initialChooseState(instructionSource), 12),
];

export default galleryModule({
  _tag: "document",
  name: "ledger-setup-play--source",
  doc: ledgerSetupPlaySource,
});
