import type { Doc } from "../doc.js";
import { inventoryCaption, inventoryRows } from "./inventory.js";

/**
 * Alternative: the inventory as change rows, the pre-responsive rendering in
 * which every row carried an `=` change glyph. Kept for side-by-side review;
 * the accepted inventory rendering is `inventory`.
 */
export const inventoryAltRows: Doc = [
  { _tag: "paragraph", text: inventoryCaption },
  {
    _tag: "rows",
    rows: inventoryRows.map((cells) => ({ _tag: "row", change: "unchanged", cells })),
  },
];
