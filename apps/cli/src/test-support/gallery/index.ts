import { blockedWaiting } from "./blocked-waiting.js";
import { detail } from "./detail.js";
import { everyNode } from "./every-node.js";
import { failureRecovery } from "./failure-recovery.js";
import type { GalleryFixture } from "./fixture.js";
import { inventory } from "./inventory.js";
import { inventoryAltRows } from "./inventory-alt-rows.js";
import { inventoryAltStacked } from "./inventory-alt-stacked.js";
import { mutationResult } from "./mutation-result.js";
import { mutationResultAltTable } from "./mutation-result-alt-table.js";
import { mutationResultAltTree } from "./mutation-result-alt-tree.js";
import { planPreview } from "./plan-preview.js";
import { widthGateFourWidths } from "./width-gate--four-widths.js";
import { widthLiveHeightCap } from "./width-live--height-cap.js";

/**
 * The terminal design gallery: one typed document or live scene per key use
 * case, plus the alternatives considered for each (`*-alt-*`). Every document
 * is painted at each gallery width, and every scene at each gallery width and
 * height, and snapshot-tested; the accepted rendering for each use case is
 * recorded in the terminal design documentation.
 *
 * A fixture drawn from the design canvas is named `<board>--<frame>`: the
 * board's file stem and the frame's caption, in kebab case, so its snapshots
 * can be held against the mock they implement.
 */
export const gallery: ReadonlyArray<GalleryFixture> = [
  { _tag: "document", name: "inventory", doc: inventory },
  { _tag: "document", name: "inventory-alt-rows", doc: inventoryAltRows },
  { _tag: "document", name: "inventory-alt-stacked", doc: inventoryAltStacked },
  { _tag: "document", name: "detail", doc: detail },
  { _tag: "document", name: "mutation-result", doc: mutationResult },
  { _tag: "document", name: "mutation-result-alt-tree", doc: mutationResultAltTree },
  { _tag: "document", name: "mutation-result-alt-table", doc: mutationResultAltTable },
  { _tag: "document", name: "failure-recovery", doc: failureRecovery },
  { _tag: "document", name: "plan-preview", doc: planPreview },
  { _tag: "document", name: "blocked-waiting", doc: blockedWaiting },
  { _tag: "document", name: "every-node", doc: everyNode },
  {
    _tag: "document",
    name: "width-gate--four-widths",
    doc: widthGateFourWidths,
    // The widths the canvas draws this gate at, so each frame has a snapshot.
    widths: [100, 80, 60, 44],
  },
  { _tag: "scene", name: "width-live--height-cap", scene: widthLiveHeightCap },
];

export const galleryWidths = [40, 80, 120, 200] as const;

/** Terminal heights a live scene must fit; settled documents are not height-bound. */
export const galleryHeights = [16, 24] as const;
