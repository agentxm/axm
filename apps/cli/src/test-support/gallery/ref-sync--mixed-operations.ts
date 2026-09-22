import { planDoc } from "../../operation-view.js";
import { mixedSyncPlan } from "./samples/sync-records.js";

/**
 * A preview whose units do not all change the same way (*Reference cases*,
 * board `2 · Sync, update, uninstall`, frame *sync --preview — mixed
 * operations in one ledger; unchanged rows fold*).
 *
 * One ledger carries all four marks, so a reader sees the shape of the whole
 * change at once: two installs, one update, one removal, and the twelve units
 * that were already current folded into one line with the flag that lists
 * them. The verdict claims only what would change; the counts sit in its
 * aside, and `no changes made` says a preview changed nothing.
 */
export const refSyncMixedOperations = planDoc(mixedSyncPlan, {
  mode: "preview",
  verbosity: "normal",
});
