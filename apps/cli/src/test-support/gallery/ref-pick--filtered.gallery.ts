import type { Doc } from "../../screen/doc.js";
import { pickDoc } from "../../screen/ask/pick.js";
import { toolkitAfter, toolkitPick } from "./samples/pick-asks.js";
import { galleryModule } from "./fixture.js";

/**
 * The grouped pick with `re` typed (canvas *Reference cases*, board `Ref-pick`,
 * frame *Filtered*): matches keep their group's header, counts cover what
 * shows, and escape clears the filter.
 */
const refPickFiltered: Doc = pickDoc(toolkitPick, toolkitAfter("type:re"), 24);

export default galleryModule({
  _tag: "document",
  name: "ref-pick--filtered",
  doc: refPickFiltered,
});
