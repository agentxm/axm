import type { Doc } from "../../screen/doc.js";
import { confirmDoc, initialConfirmState } from "../../screen/ask/confirm.js";
import { setupPlanDoc } from "../../root/setup/view.js";
import { applyAsk, syncAnswered, unsyncedPlan } from "./setup-records.js";

/**
 * Declining the sync skips the source question and leaves every instruction
 * file out of the plan (board `Ledger-setup-play`, the *sync confirm* frame
 * answered no).
 */
export const ledgerSetupPlayPlanWithoutSync: Doc = [
  ...syncAnswered(false),
  ...setupPlanDoc(unsyncedPlan),
  ...confirmDoc(applyAsk, initialConfirmState),
];
