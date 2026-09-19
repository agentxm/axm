import { operationDoc } from "../../operation-view.js";
import { verboseUpdate } from "./samples/sync-records.js";

/**
 * A settled result at verbose level (*Reference cases*, board `2 · Sync,
 * update, uninstall`, frame *update --verbose — per-agent outcomes are row
 * children, aligned to the content column*).
 *
 * The row states what happened to the extension; what each configured agent
 * did with it belongs beneath that row, not beside it, so the ledger stays
 * one line per unit at every verbosity. The agent that could not take the
 * change is the one that carries a tone.
 */
export const refSyncVerboseChildren = operationDoc(verboseUpdate, { verbosity: "verbose" });
