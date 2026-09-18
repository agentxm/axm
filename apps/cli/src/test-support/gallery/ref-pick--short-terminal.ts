import type { Doc } from "../../screen/doc.js";
import { pickDoc } from "../../screen/ask/pick.js";
import { toolkitAfter, toolkitPick } from "./pick-asks.js";

/** The rows the board's short terminal gives the question. */
const SHORT = 6;

/**
 * The grouped pick in a short terminal, caret on `changelog` (canvas
 * *Reference cases*, board `Ref-pick`, frame *Short terminal*): the window
 * scrolls inside the list, names what it left out above and below, and keeps
 * the caret's group header pinned above it.
 */
export const refPickShortTerminal: Doc = pickDoc(
  toolkitPick,
  toolkitAfter(["down", "down", "down"]),
  SHORT,
);
