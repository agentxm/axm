import { galleryModule } from "../../test-support/gallery/fixture.js";
import {
  inspectionSample,
  unresolvedInspectionSample,
} from "../../test-support/gallery/samples/inspection-samples.js";
import { localInspectionDoc } from "./view.js";

/**
 * `axm show` as a detail page: a summary of what it inspected, one titled
 * section per subject with its facts at the value column, and what did not
 * resolve as a condition with the command that lists what is there.
 */
export default galleryModule(
  { _tag: "document", name: "detail--show", doc: localInspectionDoc(inspectionSample) },
  {
    _tag: "document",
    name: "detail--show-unresolved",
    doc: localInspectionDoc(unresolvedInspectionSample),
  },
);
