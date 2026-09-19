import { admittedSet, publishFrame, triage } from "./samples/publish-results.js";

/**
 * Nothing to upload: every selected version is already published and
 * verified. Nothing changed, so there is no title and no ledger; the verdict
 * stands alone and keeps its own mark.
 */
export const refPublishAlreadyPublished = publishFrame({
  mode: "apply",
  publicationSet: admittedSet([triage]),
  results: [triage],
});
