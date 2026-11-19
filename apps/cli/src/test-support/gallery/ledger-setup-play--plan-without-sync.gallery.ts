import type { Doc } from "../../screen/doc.js";
import { confirmDoc, initialConfirmState } from "../../screen/ask/confirm.js";
import { setupPlanDoc } from "../../root/setup/view.js";
import { applyAsk, syncAnswered, unsyncedPlan } from "./samples/setup-records.js";
import { galleryModule } from "./fixture.js";

/**
 * Declining the sync skips the source question and leaves every instruction
 * file out of the plan (board `Ledger-setup-play`, the *sync confirm* frame
 * answered no).
 */
const ledgerSetupPlayPlanWithoutSync: Doc = [
  ...syncAnswered(false),
  ...setupPlanDoc(unsyncedPlan),
  ...confirmDoc(applyAsk, initialConfirmState),
];

export default galleryModule({
  _tag: "document",
  name: "ledger-setup-play--plan-without-sync",
  doc: ledgerSetupPlayPlanWithoutSync,
});
