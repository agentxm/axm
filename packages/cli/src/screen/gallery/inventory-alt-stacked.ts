import type { Doc } from "../doc.js";
import { inventoryCaption, inventoryColumns, inventoryRows } from "./inventory.js";
import { plain } from "../doc.js";

/**
 * Alternative: one fields block per extension at every width, the layout the
 * responsive table falls back to below the stacked threshold. Kept for
 * side-by-side review; the accepted inventory rendering is `inventory`.
 */
export const inventoryAltStacked: Doc = [
  { _tag: "paragraph", text: inventoryCaption },
  ...inventoryRows.flatMap((cells, index): Doc => [
    ...(index === 0 ? [] : [{ _tag: "blank" } as const]),
    {
      _tag: "fields",
      fields: inventoryColumns.map((column, position) => ({
        label: plain(column.header),
        value: cells[position] ?? "",
      })),
    },
  ]),
];
