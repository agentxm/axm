import { admittedSet, publishFrame, triage } from "./samples/publish-results.js";
import { galleryModule } from "./fixture.js";

/**
 * Nothing to upload: every selected version is already published. Nothing
 * changed, so there is no title and no ledger; the verdict stands alone and
 * keeps its own mark.
 */
const refPublishAlreadyPublished = publishFrame({
  mode: "apply",
  publicationSet: admittedSet([triage]),
  results: [triage],
});

export default galleryModule({
  _tag: "document",
  name: "ref-publish--already-published",
  doc: refPublishAlreadyPublished,
});
