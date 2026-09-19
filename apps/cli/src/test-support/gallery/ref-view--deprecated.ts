import { viewPageDoc } from "../../root/view/view.js";
import { changelog } from "./samples/view-samples.js";

/**
 * A deprecated extension (*Reference cases*, board `5 · View`, frame
 * *Deprecated — the notice leads, the replacement is the next step*).
 *
 * The aside says `deprecated` in warning tone, a callout carries the date and
 * the owner's message, the replacement is a field, and the next step installs
 * the replacement rather than the extension being viewed.
 */
export const refViewDeprecated = viewPageDoc(changelog);
