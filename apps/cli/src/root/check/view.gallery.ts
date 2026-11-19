import { galleryModule } from "../../test-support/gallery/fixture.js";
import {
  attentionCheckSample,
  satisfiedCheckSample,
} from "../../test-support/gallery/samples/inspection-samples.js";
import { localCheckDoc } from "./view.js";

/**
 * `axm check` as a result: what it assessed and how each check concluded,
 * the conditions that need attention grouped by kind, and the verdict last.
 */
export default galleryModule(
  { _tag: "document", name: "ref-check--satisfied", doc: localCheckDoc(satisfiedCheckSample) },
  { _tag: "document", name: "ref-check--attention", doc: localCheckDoc(attentionCheckSample) },
);
