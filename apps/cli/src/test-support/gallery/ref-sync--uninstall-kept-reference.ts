import { operationDoc } from "../../operation-view.js";
import { uninstallWithRetainedReference } from "./samples/sync-records.js";

/**
 * An uninstall that left something behind (*Reference cases*, board `2 ·
 * Sync, update, uninstall`, frame *uninstall — removals, and a reference that
 * survives them*).
 *
 * Two units were removed and one was kept because it is declared in its own
 * right, so the kept unit stays on the ledger with an `=` rather than
 * disappearing into a fold. What AXM observed but does not own follows the
 * ledger as a callout, because it is context for the outcome rather than a
 * unit of it.
 */
export const refSyncUninstallKeptReference = operationDoc(uninstallWithRetainedReference, {
  verbosity: "normal",
});
