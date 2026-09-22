import { operationDoc } from "../../operation-view.js";
import { failedRolledBackInstall } from "./samples/operation-stress.js";

/**
 * An install that failed and rolled back: the pack that had been written was
 * restored, the member that could not resolve states why, and the two units
 * behind it were never tried. Nothing is half-applied, so what the reader
 * needs is the reason and the state each unit was left in.
 */
export const refInstallFailedRolledBack = operationDoc(failedRolledBackInstall, {
  verbosity: "normal",
  suggestions: [{ description: "Inspect installed extensions", cmd: "axm list" }],
});
