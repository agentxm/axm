import { operationDoc } from "../../operation-view.js";
import { packInstall } from "./samples/operation-stress.js";
import { galleryModule, stressWidths } from "./fixture.js";

/**
 * A pack install that committed: the pack's row, then the members its closure
 * settled nested beneath it, each with the version it reached and where it
 * landed. The member already current is listed only at verbose level, and the
 * closure's projection step is not a row of its own.
 */
const doc = (verbosity: "normal" | "verbose") =>
  operationDoc(packInstall, {
    verbosity,
    project: "platform-services",
    suggestions: [{ description: "Inspect installed extensions", cmd: "axm list" }],
  });

export default galleryModule(
  {
    _tag: "document",
    name: "ref-install--pack",
    doc: doc("normal"),
    snapshotWidths: stressWidths,
  },
  {
    _tag: "document",
    name: "ref-install--pack-verbose",
    doc: doc("verbose"),
    snapshotWidths: stressWidths,
  },
);
