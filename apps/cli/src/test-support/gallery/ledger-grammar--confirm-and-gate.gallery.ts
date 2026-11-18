import type { Doc } from "../../screen/doc.js";
import { confirmDoc } from "../../screen/ask/confirm.js";
import { syncInstructions } from "./samples/confirm-asks.js";
import { galleryModule } from "./fixture.js";

/**
 * A question with a note while it stands open (canvas *Direction: Ledger*,
 * board `Ledger-grammar`, frame *confirm and gate*).
 */
const ledgerGrammarConfirmAndGate: Doc = confirmDoc(syncInstructions, { index: 0 });

export default galleryModule({
  _tag: "document",
  name: "ledger-grammar--confirm-and-gate",
  doc: ledgerGrammarConfirmAndGate,
});
