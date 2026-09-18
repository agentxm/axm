import type { Doc } from "../../screen/doc.js";
import { pickAnswer } from "../../screen/ask/pick.js";
import { toolkitPick } from "./pick-asks.js";

/**
 * The one line an answered pick leaves (canvas *Reference cases*, board
 * `Ref-pick`, frame *Answered*): the titles picked at the value column.
 */
export const refPickAnswered: Doc = pickAnswer(toolkitPick, [0, 1]);
