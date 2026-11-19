import type { Doc } from "../../screen/doc.js";
import { confirmDoc, initialConfirmState } from "../../screen/ask/confirm.js";
import { applyChangesGate } from "./samples/confirm-asks.js";
import { galleryModule } from "./fixture.js";

/**
 * The review gate at the three widths the canvas draws it at (*Width and
 * height*, board `Width-prompts`): the question and its chips on one line, the
 * chips on their own line, and the chips without their words.
 */
const widthPromptsConfirm: Doc = confirmDoc(applyChangesGate, initialConfirmState);

export default galleryModule({
  _tag: "document",
  name: "width-prompts--confirm",
  doc: widthPromptsConfirm,
  // The widths the canvas draws the three chip fallbacks at.
  snapshotWidths: [80, 48, 30],
});
