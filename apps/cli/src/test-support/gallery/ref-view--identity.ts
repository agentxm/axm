import { viewPageDoc } from "../../root/view/view.js";
import { codeReview } from "./samples/view-samples.js";

/**
 * A detail page (*Reference cases*, board `5 · View`, frame *view — an
 * identity line, the description, fields, and the one command worth
 * copying*).
 *
 * The bold handle leads with its type, visibility and lifecycle as a dim
 * aside; the description is prose; the facts sit on the value column; and the
 * install command is the one `next` action. Versions past the fifth give way
 * to the total.
 */
export const refViewIdentity = viewPageDoc(codeReview);
