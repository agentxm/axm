import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "@effect/vitest";
import {
  defineSpecification,
  defineBoundEvidence,
} from "@agentxm/extension-model/unstable/specifications";
import { readReleaseWorkflow } from "../../support/release-workflow.js";

export const specification = defineSpecification({
  requirement: "system/process/release-publication-reuses-identical-content",
  title: "Release reruns reuse only identical published content",
  statement:
    "A rerun of one release coordinate shall verify and reuse identical published content, publish missing outputs and reject conflicting bytes or failed existence queries without overwriting published outputs or requiring a promotion bypass.",
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
      "Exercises absent and identical outputs, integrity conflicts, failed existence reads, partial publication reruns, and identical-coordinate promotion without credentials.",
  },
]);

describe("Release reruns reuse only identical published content", () => {
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
    expect(source).toContain("publishImmutable");
    expect(source).toContain("prepareFormula");
  });
});
