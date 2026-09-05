import { describe, expect, it } from "@effect/vitest";
import {
  defineSpecification,
  defineBoundEvidence,
} from "@agentxm/extension-model/unstable/specifications";
import { readReleaseWorkflow, promotionPermitted } from "../../support/release-workflow.js";

export const specification = defineSpecification({
  requirement: "system/process/stable-promotion-follows-verified-distribution",
  title: "Stable promotion follows verified candidate distribution",
  statement:
    "The canonical release workflow shall attempt stable promotion only after publication of the candidate binary/checksum assets, fixed npm cohort, Homebrew formula and official skill, and successful exact-candidate script, published-package, Homebrew and official-skill installation verification; promotion failures shall not prevent that preceding distribution.",
  class: "process",
  role: "supporting",
  goals: ["trustworthy-distribution", "dependable-change-process"],
  boundary: "repository",
  boundaryRationale:
    "The canonical workflow graph defines required release readiness and exact-candidate job inputs.",
  methods: ["contract"],
  derivedFrom: ["system/process/release-promotion-precedes-independent-distribution"],
  supersedes: ["system/process/release-promotion-precedes-independent-distribution"],
  assumptions: [
    "The release coordinate is immutable and each required verifier reports truthful evidence about its named candidate.",
  ],
  openQuestions: [],
  limitations: [
    {
      limitation:
        "Repository evidence checks the workflow graph; it does not execute the published installer platform matrix.",
      retirementCondition:
        "An authorized release supplies successful exact-candidate matrix results and promotion readback.",
    },
  ],
});
export const boundEvidence = defineBoundEvidence([
  {
    gate: "test: specifications:test",
    verifies:
      "Parses actual job dependencies and required success conditions, exercises each failed/skipped/canceled gate, and checks exact candidate inputs and the declared installer matrix.",
  },
  {
    gate: "test: axm:test (scripts/verify-installed-package.tooling.test.ts)",
    verifies:
      "Runs the published-package verifier through a package-manager launcher with sibling entrypoints from an unrelated directory, including paths with spaces, and rejects wrong installed versions and unexpected stderr; Windows CI executes the batch-launcher cases.",
  },
]);

const required = [
  "release",
  "install-verify",
  "package-verify",
  "brew-verify",
  "skill-publish",
  "skill-verify",
];

describe("Stable readiness", () => {
  it("requires every distribution and verification job before promotion", () => {
    const workflow = readReleaseWorkflow();
    const promotion = workflow.jobs["promote"];
    expect(promotion?.needs).toEqual(required);
    const condition = promotion?.if ?? "";
    const successful = Object.fromEntries(required.map((job) => [job, "success"]));
    expect(promotionPermitted(condition, successful)).toBe(true);
    expect(promotionPermitted(condition, successful, false)).toBe(false);
    for (const job of required) {
      for (const result of ["failure", "skipped", "cancelled"]) {
        expect(promotionPermitted(condition, { ...successful, [job]: result })).toBe(false);
      }
      expect(workflow.jobs[job]?.["continue-on-error"]).not.toBe(true);
      expect(workflow.jobs[job]?.needs ?? []).not.toContain("promote");
    }
  });
  it("verifies the published exact candidate across the required platform samples", () => {
    const jobs = readReleaseWorkflow().jobs;
    expect(jobs["install-verify"]?.strategy?.matrix.include).toEqual([
      { os: "ubuntu-latest", mode: "bash" },
      { os: "macos-latest", mode: "bash" },
      { os: "windows-latest", mode: "powershell" },
      { os: "windows-latest", mode: "cmd" },
    ]);
    expect(jobs["package-verify"]?.strategy?.matrix.include).toEqual([
      { os: "ubuntu-latest", manager: "npm" },
      { os: "macos-latest", manager: "npm" },
      { os: "windows-latest", manager: "npm" },
      { os: "ubuntu-latest", manager: "pnpm" },
      { os: "ubuntu-latest", manager: "yarn" },
    ]);
    for (const name of ["install-verify", "package-verify", "skill-publish", "promote"]) {
      const checkout = jobs[name]?.steps.find((step) => step.uses?.startsWith("actions/checkout@"));
      expect(checkout?.with?.["ref"]).toBe("${{ needs.release.outputs.sha }}");
    }
    expect(
      jobs["package-verify"]?.steps.some((step) =>
        step.run?.includes("axm:verify-installed-package"),
      ),
    ).toBe(true);
  });
});
