import type { Doc } from "../../screen/doc.js";
import { pickDoc } from "../../screen/ask/pick.js";
import { toolkitAfter, toolkitPick } from "./samples/pick-asks.js";

/**
 * The grouped pick with `re` typed (canvas *Reference cases*, board `Ref-pick`,
 * frame *Filtered*): matches keep their group's header, counts cover what
 * shows, and escape clears the filter.
 */
export const refPickFiltered: Doc = pickDoc(toolkitPick, toolkitAfter(["r", "e"]), 24);
