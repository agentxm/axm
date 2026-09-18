import type { Doc } from "../../screen/doc.js";
import { chooseDoc, initialChooseState } from "../../screen/ask/choose.js";
import { instructionSource } from "./instruction-source-asks.js";

/**
 * The instructions-source list at the widths the canvas draws its prompts at
 * (*Width and height*, board `Width-prompts`): details beside every option,
 * then none once any would not fit whole, so names are never touched first.
 */
export const widthPromptsChoose: Doc = chooseDoc(
  instructionSource,
  initialChooseState(instructionSource),
  24,
);
