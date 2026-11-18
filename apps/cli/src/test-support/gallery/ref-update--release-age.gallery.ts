import { releaseAgeDoc } from "../../operation-output.js";
import { galleryModule, galleryWidths } from "./fixture.js";

/** The two observable minimum-release-age outcomes: waiting and explicitly allowed. */
const refUpdateReleaseAge = releaseAgeDoc(
  { command: ["update"], arguments: [] },
  {
    holdbacks: [
      {
        reason: "minimum-release-age",
        target: "@acme/skills/reviewer",
        dependencyPath: ["@acme/skills/reviewer"],
        selectedVersion: "1.0.0",
        candidateVersion: "2.0.0",
        publishedAt: "2026-09-21T16:44:17.865Z",
        eligibleAt: "2026-09-22T16:44:17.865Z",
        minimumReleaseAgeSeconds: 86_400,
      },
    ],
    releaseAgeBypasses: [
      {
        reason: "minimum-release-age",
        target: "@acme/packs/field-notes",
        dependencyPath: ["@acme/packs/field-notes"],
        candidateVersion: "1.0.0",
        publishedAt: "2026-09-21T16:44:17.865Z",
        eligibleAt: "2026-09-22T16:44:17.865Z",
        minimumReleaseAgeSeconds: 86_400,
        bypassCause: "exclude",
        exemptionScope: "project",
      },
    ],
  },
);

export default galleryModule({
  _tag: "document",
  name: "ref-update--release-age",
  doc: refUpdateReleaseAge,
  // Its 200-column painting differs from its 120-column one.
  snapshotWidths: galleryWidths,
});
