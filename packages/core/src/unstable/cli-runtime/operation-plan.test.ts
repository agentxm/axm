import { describe, expect, it } from "vitest";

import { makeOperationPlan } from "./operation-plan.js";

describe("makeOperationPlan", () => {
  it("counts and preserves release-age evidence", () => {
    const record = {
      reason: "minimum-release-age" as const,
      target: "@acme/skills/review",
      dependencyPath: ["@acme/skills/review"],
      candidateVersion: "2.0.0",
      publishedAt: "2026-08-11T12:00:00.000Z",
      eligibleAt: "2026-08-12T12:00:00.000Z",
      minimumReleaseAgeSeconds: 86_400,
    };
    const bypass = { ...record, bypassCause: "ignore-flag" as const };
    const result = makeOperationPlan({
      planName: "Update skill",
      evaluatedAt: "2026-08-12T00:00:00.000Z",
      holdbacks: [record],
      releaseAgeBypasses: [bypass],
      steps: [],
    });

    expect(result).toMatchObject({
      evaluatedAt: "2026-08-12T00:00:00.000Z",
      holdbackCount: 1,
      holdbacks: [record],
      releaseAgeBypassCount: 1,
      releaseAgeBypasses: [bypass],
    });
  });
});
