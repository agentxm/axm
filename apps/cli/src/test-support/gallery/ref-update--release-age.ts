import { releaseAgeDoc } from "../../operation-output.js";

/** The two observable minimum-release-age outcomes: waiting and explicitly allowed. */
export const refUpdateReleaseAge = releaseAgeDoc("update", {
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
});
