import type { Doc } from "../../screen/doc.js";
import { confirmDoc, initialConfirmState } from "../../screen/ask/confirm.js";
import { setupPlanDoc } from "../../root/setup/view.js";
import { applyAsk, sourceAnswered, syncedPlan } from "./setup-records.js";

/**
 * The answers read back as one aligned record, the plan as a ledger of the
 * targets setup would touch, and the standard apply gate beneath it (board
 * `Ledger-setup-play`, frame *plan gate*).
 */
export const ledgerSetupPlayPlan: Doc = [
  ...sourceAnswered,
  ...setupPlanDoc(syncedPlan),
  ...confirmDoc(applyAsk, initialConfirmState),
];
