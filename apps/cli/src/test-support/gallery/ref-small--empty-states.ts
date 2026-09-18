import type { Doc } from "../../screen/doc.js";
import { emptyInventoryDoc } from "../../root/list/view.js";

/**
 * Empty and first-run inventories (*Reference cases*, board `7 · Smaller
 * cases`, frame *Empty and first-run states — say what is true, then the one
 * next step*).
 *
 * An empty workspace points at `axm discover`; a directory with no workspace
 * points at `axm setup`. The canvas draws the second as an error; `axm list`
 * reads a missing workspace as an empty inventory and succeeds, so it stays a
 * plain state.
 */
export const refSmallEmptyStates: Doc = [
  ...emptyInventoryDoc("empty-project"),
  { _tag: "blank" },
  ...emptyInventoryDoc("no-workspace"),
];
