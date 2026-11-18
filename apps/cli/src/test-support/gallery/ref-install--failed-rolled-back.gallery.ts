import { operationDoc } from "../../operation-view.js";
import { operationNextActions, resolutionRecoveries } from "../../operation-output.js";
import { failedRolledBackInstall } from "./samples/operation-stress.js";
import { galleryModule, stressWidths } from "./fixture.js";

/**
 * An install that failed and rolled back: the pack that had been written was
 * restored, the member that could not resolve states why, and the two units
 * behind it were never tried. Nothing is half-applied, so what the reader
 * needs is the reason and the state each unit was left in.
 */
const refInstallFailedRolledBack = operationDoc(failedRolledBackInstall, {
  verbosity: "normal",
  suggestions: operationNextActions(resolutionRecoveries(failedRolledBackInstall), [
    { description: "Inspect installed extensions", cmd: "axm list" },
  ]),
});

export default galleryModule({
  _tag: "document",
  name: "ref-install--failed-rolled-back",
  doc: refInstallFailedRolledBack,
  // The stress frames add the hundred columns a working terminal actually has.
  snapshotWidths: stressWidths,
});
