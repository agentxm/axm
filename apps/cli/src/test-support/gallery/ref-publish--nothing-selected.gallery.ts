import { publishFrame } from "./samples/publish-results.js";
import { galleryModule } from "./fixture.js";

/** A selection that matched nothing to publish: the verdict alone. */
const refPublishNothingSelected = publishFrame({ mode: "apply", results: [] });

export default galleryModule({
  _tag: "document",
  name: "ref-publish--nothing-selected",
  doc: refPublishNothingSelected,
});
