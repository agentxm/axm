import type { Doc } from "../../screen/doc.js";
import { chooseDoc, initialChooseState } from "../../screen/ask/choose.js";
import { instructionSource } from "./samples/instruction-source-asks.js";
import { galleryModule } from "./fixture.js";

/**
 * A list open under its question with the caret on the recommended file
 * (canvas *Direction: Ledger*, board `Ledger-grammar`, frame *choose one*).
 */
const ledgerGrammarChooseOne: Doc = chooseDoc(
  instructionSource,
  initialChooseState(instructionSource),
  24,
);

export default galleryModule({
  _tag: "document",
  name: "ledger-grammar--choose-one",
  doc: ledgerGrammarChooseOne,
});
