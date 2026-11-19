import type { Doc } from "../../screen/doc.js";
import { confirmDoc, initialConfirmState } from "../../screen/ask/confirm.js";
import { setupPlanDoc } from "../../root/setup/view.js";
import { applyAsk, sourceAnswered, syncedPlan } from "./samples/setup-records.js";
import { galleryModule } from "./fixture.js";

/**
 * The answers read back as one aligned record, the plan as a ledger of the
 * targets setup would touch, and the standard apply gate beneath it (board
 * `Ledger-setup-play`, frame *plan gate*).
 */
const ledgerSetupPlayPlan: Doc = [
  ...sourceAnswered,
  ...setupPlanDoc(syncedPlan),
  ...confirmDoc(applyAsk, initialConfirmState),
];

export default galleryModule({
  _tag: "document",
  name: "ledger-setup-play--plan",
  doc: ledgerSetupPlayPlan,
});
