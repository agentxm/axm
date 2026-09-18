import type { Doc } from "../../screen/doc.js";
import { initialPickState, pickDoc } from "../../screen/ask/pick.js";
import { agentsPick } from "./pick-asks.js";

/** The rows the board's list is drawn in: its page shows four agents. */
const ROWS = 7;

/**
 * Setup's agents in a list whose page follows the terminal height (canvas
 * *Width and height*, board `Width-prompts`, frames *list page size follows
 * terminal height* and *the same list at 48 columns*): descriptions drop
 * before names are touched, and the keys lose their words.
 */
export const widthPromptsPick: Doc = pickDoc(agentsPick, initialPickState(agentsPick), ROWS);
