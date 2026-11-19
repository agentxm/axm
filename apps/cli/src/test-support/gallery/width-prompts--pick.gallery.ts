import type { Doc } from "../../screen/doc.js";
import { initialPickState, pickDoc } from "../../screen/ask/pick.js";
import { agentsPick } from "./samples/pick-asks.js";
import { galleryModule } from "./fixture.js";

/** The rows the board's list is drawn in: its page shows four agents. */
const ROWS = 7;

/**
 * Setup's agents in a list whose page follows the terminal height (canvas
 * *Width and height*, board `Width-prompts`, frames *list page size follows
 * terminal height* and *the same list at 48 columns*): descriptions drop
 * before names are touched, and the keys lose their words.
 */
const widthPromptsPick: Doc = pickDoc(agentsPick, initialPickState(agentsPick), ROWS);

export default galleryModule({
  _tag: "document",
  name: "width-prompts--pick",
  doc: widthPromptsPick,
  // The widths the canvas draws the list at, with and without descriptions.
  snapshotWidths: [80, 48],
});
