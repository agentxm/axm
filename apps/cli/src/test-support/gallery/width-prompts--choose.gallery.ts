import type { Doc } from "../../screen/doc.js";
import { chooseDoc, initialChooseState } from "../../screen/ask/choose.js";
import { instructionSource } from "./samples/instruction-source-asks.js";
import { galleryModule } from "./fixture.js";

/**
 * The instructions-source list at the widths the canvas draws its prompts at
 * (*Width and height*, board `Width-prompts`): details beside every option,
 * then none once any would not fit whole, so names are never touched first.
 */
const widthPromptsChoose: Doc = chooseDoc(
  instructionSource,
  initialChooseState(instructionSource),
  24,
);

export default galleryModule({
  _tag: "document",
  name: "width-prompts--choose",
  doc: widthPromptsChoose,
  // The confirmation's three widths, where details show, drop, and titles hold.
  snapshotWidths: [80, 48, 30],
});
