import { operationDoc } from "../../operation-view.js";
import { blockedSync } from "./samples/operation-stress.js";

/**
 * A sync blocked before it changed anything: one unit is held by two settings
 * that cannot both hold, the pack that depends on it is blocked behind it,
 * and the rest were never reached. No command resolves a contradiction, so
 * the reader needs the reason rather than a retry.
 */
export const refSyncBlocked = operationDoc(blockedSync, {
  verbosity: "normal",
  suggestions: [{ description: "Inspect installed extensions", cmd: "axm list" }],
});
