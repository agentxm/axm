import type { Doc } from "../../screen/doc.js";
import { initialPickState, pickDoc } from "../../screen/ask/pick.js";
import { toolkitPick } from "./samples/pick-asks.js";
import { galleryModule } from "./fixture.js";

/**
 * A grouped pick as it opens (canvas *Reference cases*, board `Ref-pick`,
 * frame *Grouped pick*): each group's header carries a tri-state mark and a
 * count, and its options sit one step in.
 */
const refPickGrouped: Doc = pickDoc(toolkitPick, initialPickState(toolkitPick), 24);

export default galleryModule({
  _tag: "document",
  name: "ref-pick--grouped",
  doc: refPickGrouped,
});
