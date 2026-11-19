import { deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";

import { settledNextActions } from "../../operation-output.js";
import { operationDoc } from "../../operation-view.js";
import { failedRolledBackInstall } from "./samples/operation-stress.js";
import { galleryModule, stressWidths } from "./fixture.js";

/**
 * A pack install that failed and rolled back: the member that could not be
 * fetched is named in the pack's reason, and the closure restored everything
 * it wrote. Nothing is half-applied, so what the reader needs is the reason
 * and a recovery for it, and install's general suggestion gives way to that.
 */
const refInstallFailedRolledBack = operationDoc(failedRolledBackInstall, {
  verbosity: "normal",
  project: "platform-services",
  suggestions: settledNextActions(
    failedRolledBackInstall,
    deriveOperationOutcome(failedRolledBackInstall),
    [{ description: "Inspect installed extensions", cmd: "axm list" }],
  ),
});

export default galleryModule({
  _tag: "document",
  name: "ref-install--failed-rolled-back",
  doc: refInstallFailedRolledBack,
  // The stress frames add the hundred columns a working terminal actually has.
  snapshotWidths: stressWidths,
});
