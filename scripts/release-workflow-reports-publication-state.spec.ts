import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification, defineBoundEvidence } from "@agentxm/specification-metadata";
import { readReleaseWorkflow } from "./release-workflow-graph.js";

export const specification = defineSpecification({
  requirement: "system/process/release-workflow-reports-publication-state",
  title: "Release results distinguish distribution and verification state",
  statement:
    "The canonical release workflow shall report the exact candidate and every publication and verification result, distinguishing completed releases, incomplete attempts and superseded candidates.",
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
    gate: "test: axm:test (scripts/release-publication.test.ts, scripts/update-homebrew-formula.test.ts)",
    verifies:
      "Exercises publication boundary outcomes, bounded readback after ambiguous owner responses, and no repeated conditional mutation.",
  },
]);

describe("Release results distinguish distribution and verification state", () => {
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
      fileURLToPath(new URL("./distribute-release.ts", import.meta.url)),
      "utf8",
    );
    expect(source).toContain("distributeRelease");
    expect(source).toContain('output("outcome"');
  });
});

describe("Publication summary evidence", () => {
  it.skipIf(process.platform === "win32").each([
    {
      distribution: "distribution-failed",
      verification: "skipped",
      expected: "Distribution or verification incomplete",
    },
    {
      distribution: "distributed",
      verification: "failure",
      expected: "Distribution or verification incomplete",
    },
    {
      distribution: "distributed",
      verification: "success",
      expected: "Distribution and verification complete",
    },
    {
      distribution: "superseded",
      verification: "skipped",
      expected: "Superseded candidate",
    },
  ])("reports $distribution / $verification truthfully", (scenario) => {
    const directory = mkdtempSync(join(tmpdir(), "release-summary-"));
    const summary = join(directory, "summary.md");
    try {
      const command = readReleaseWorkflow().jobs["summary"]?.steps[0]?.run;
      if (command === undefined) throw new Error("Missing canonical release summary.");
      const results = Object.fromEntries(
        ["install-verify", "package-verify", "brew-verify"].map((name) => [
          name,
          { result: scenario.verification, outputs: {} },
        ]),
      );
      const run = spawnSync("bash", ["-euo", "pipefail", "-c", command], {
        encoding: "utf8",
        env: {
          ...process.env,
          ELIGIBLE: "true",
          MODE: "stable-auto",
          GITHUB_STEP_SUMMARY: summary,
          RELEASE_TAG: "cli-v1.2.3",
          RELEASE_VERSION: "1.2.3",
          RELEASE_COMMIT: "a".repeat(40),
          GITHUB_RELEASE: "published",
          PUBLICATION: '{"artifacts":"succeeded","npm":"succeeded","tap":"succeeded"}',
          DISTRIBUTION: scenario.distribution,
          RESULTS: JSON.stringify(results),
        },
      });
      expect(run.status, run.stderr).toBe(0);
      const text = readFileSync(summary, "utf8");
      expect(text).toContain(scenario.expected);
      expect(text).toContain("cli-v1.2.3");
      expect(text).toContain("a".repeat(40));
      for (const name of Object.keys(results))
        expect(text).toContain(`${name}: ${scenario.verification}`);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
