import type { Doc } from "../../screen/doc.js";
import { pickAnswer } from "../../screen/ask/pick.js";
import { toolkitPick } from "./samples/pick-asks.js";
import { galleryModule } from "./fixture.js";

/**
 * The one line an answered pick leaves (canvas *Reference cases*, board
 * `Ref-pick`, frame *Answered*): the titles picked at the value column.
 */
const refPickAnswered: Doc = pickAnswer(toolkitPick, [0, 1]);

export default galleryModule({
  _tag: "document",
  name: "ref-pick--answered",
  doc: refPickAnswered,
});
