import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "@effect/vitest";
import {
  defineSpecification,
  defineBoundEvidence,
} from "@agentxm/extension-model/unstable/specifications";
import { readReleaseWorkflow } from "../../support/release-workflow.js";

export const specification = defineSpecification({
  requirement: "system/process/release-publication-preserves-newer-versions",
  title: "Release publication preserves newer distribution versions",
  statement:
    "The canonical release workflow shall serialize active release publications across tags and stop an older candidate as superseded when a newer npm latest, Homebrew formula or stable version is observed, without moving those publications backward or attempting historical distribution repair.",
  class: "process",
  role: "supporting",
  goals: ["trustworthy-distribution", "dependable-change-process"],
  boundary: "repository",
  boundaryRationale:
    "Canonical publication adapters and bound failure-injection tooling provide evidence without publishing a real release.",
  methods: ["contract"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});
export const boundEvidence = defineBoundEvidence([
  {
    gate: "test: axm:test (scripts/release-publication.tooling.test.ts, scripts/release-channel-promotion.tooling.test.ts, scripts/update-homebrew-formula.tooling.test.ts)",
    verifies:
      "Exercises older candidates before publication and at owner write boundaries, equal-version formula conflicts and newer-channel retention.",
  },
]);

describe("Release publication preserves newer distribution versions", () => {
  it("binds the canonical workflow to the verified publication controls", () => {
    const workflow = readReleaseWorkflow();
    expect(workflow.concurrency).toEqual({
      group: "canonical-release-publication",
      "cancel-in-progress": false,
    });
    expect(
      workflow.jobs["release"]?.steps.some((step) => step.run?.includes("axm:distribute-release")),
    ).toBe(true);
    expect(workflow.jobs["summary"]?.if).toBe("always()");
    const source = readFileSync(
      fileURLToPath(new URL("../../../scripts/distribute-release.ts", import.meta.url)),
      "utf8",
    );
    expect(source).toContain("guardPublicationVersion");
    expect(source).toContain("latestGuard");
  });
});
