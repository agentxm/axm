import type { Doc } from "../../screen/doc.js";
import { initialInputState, inputDoc } from "../../screen/ask/input.js";
import { instructionFileName } from "./samples/instruction-source-asks.js";
import { galleryModule } from "./fixture.js";

/**
 * A typed line before anything is typed, showing its placeholder behind the
 * caret (canvas *Direction: Ledger*, board `Ledger-grammar`, frame *input*).
 */
const ledgerGrammarInput: Doc = inputDoc(instructionFileName, initialInputState);

export default galleryModule({
  _tag: "document",
  name: "ledger-grammar--input",
  doc: ledgerGrammarInput,
});
