import type { Doc } from "../doc.js";
import { blockedWaiting } from "./blocked-waiting.js";
import { detail } from "./detail.js";
import { everyNode } from "./every-node.js";
import { failureRecovery } from "./failure-recovery.js";
import { inventory } from "./inventory.js";
import { inventoryAltRows } from "./inventory-alt-rows.js";
import { inventoryAltStacked } from "./inventory-alt-stacked.js";
import { mutationResult } from "./mutation-result.js";
import { mutationResultAltTable } from "./mutation-result-alt-table.js";
import { mutationResultAltTree } from "./mutation-result-alt-tree.js";
import { planPreview } from "./plan-preview.js";

export interface GalleryFixture {
  readonly name: string;
  readonly doc: Doc;
}

/**
 * The terminal design gallery: one typed document per key use case, plus the
 * alternatives considered for each (`*-alt-*`). Every fixture is painted at
 * several widths and snapshot-tested; the accepted rendering for each use
 * case is recorded in the terminal design documentation.
 */
export const gallery: ReadonlyArray<GalleryFixture> = [
  { name: "inventory", doc: inventory },
  { name: "inventory-alt-rows", doc: inventoryAltRows },
  { name: "inventory-alt-stacked", doc: inventoryAltStacked },
  { name: "detail", doc: detail },
  { name: "mutation-result", doc: mutationResult },
  { name: "mutation-result-alt-tree", doc: mutationResultAltTree },
  { name: "mutation-result-alt-table", doc: mutationResultAltTable },
  { name: "failure-recovery", doc: failureRecovery },
  { name: "plan-preview", doc: planPreview },
  { name: "blocked-waiting", doc: blockedWaiting },
  { name: "every-node", doc: everyNode },
];

export const galleryWidths = [40, 80, 120, 200] as const;
