import { operationDoc } from "../../operation-view.js";
import { blockedSync } from "./samples/operation-stress.js";
import { galleryModule, stressWidths } from "./fixture.js";

/**
 * A sync blocked before it changed anything: one unit is held by two settings
 * that cannot both hold, the pack that depends on it is blocked behind it,
 * and the rest were never reached. No command resolves a contradiction, so
 * the reader needs the reason rather than a retry.
 */
const refSyncBlocked = operationDoc(blockedSync, {
  verbosity: "normal",
  project: "platform-services",
  suggestions: [{ description: "Inspect installed extensions", cmd: "axm list" }],
});

export default galleryModule({
  _tag: "document",
  name: "ref-sync--blocked",
  doc: refSyncBlocked,
  // The stress frames add the hundred columns a working terminal actually has.
  snapshotWidths: stressWidths,
});
