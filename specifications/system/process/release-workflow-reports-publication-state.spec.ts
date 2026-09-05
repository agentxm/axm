import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "@effect/vitest";
import {
  defineSpecification,
  defineBoundEvidence,
} from "@agentxm/extension-model/unstable/specifications";
import { readReleaseWorkflow } from "../../support/release-workflow.js";

export const specification = defineSpecification({
  requirement: "system/process/release-workflow-reports-publication-state",
  title: "Release results distinguish distribution and promotion state",
  statement:
    "The canonical release workflow shall report the exact candidate and every publication and verification result separately from confirmed, incomplete or uncertain promotion and superseded candidates, retaining uncertain submission evidence until bounded readback confirms channel state.",
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
      "Exercises publication boundary outcomes, one readback after a lost promotion response, uncertain readback failures, and no repeated conditional mutation.",
  },
]);

describe("Release results distinguish distribution and promotion state", () => {
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
    expect(source).toContain("distributeRelease");
    expect(source).toContain('output("outcome"');
  });
});

describe("Publication summary evidence", () => {
  it.skipIf(process.platform === "win32").each([
    {
      distribution: "distribution-failed",
      promotion: "",
      verification: "skipped",
      expected: "Distribution or verification incomplete",
    },
    {
      distribution: "distributed",
      promotion: "",
      verification: "failure",
      expected: "Distribution or verification incomplete",
    },
    {
      distribution: "distributed",
      promotion: "",
      verification: "success",
      expected: "Distribution complete; promotion incomplete or uncertain",
    },
    {
      distribution: "distributed",
      promotion: "promoted",
      verification: "success",
      expected: "Promotion confirmed",
    },
    {
      distribution: "distributed",
      promotion: "already-current",
      verification: "success",
      expected: "Promotion confirmed",
    },
    {
      distribution: "superseded",
      promotion: "",
      verification: "skipped",
      expected: "Superseded candidate",
    },
    {
      distribution: "distributed",
      promotion: "newer-channel-retained",
      verification: "success",
      expected: "Superseded candidate",
    },
  ])("reports $distribution / $promotion / $verification truthfully", (scenario) => {
    const directory = mkdtempSync(join(tmpdir(), "release-summary-"));
    const summary = join(directory, "summary.md");
    try {
      const command = readReleaseWorkflow().jobs["summary"]?.steps[0]?.run;
      if (command === undefined) throw new Error("Missing canonical release summary.");
      const results = Object.fromEntries(
        ["install-verify", "package-verify", "brew-verify", "skill-publish", "skill-verify"].map(
          (name) => [name, { result: scenario.verification, outputs: {} }],
        ),
      );
      const run = spawnSync("bash", ["-euo", "pipefail", "-c", command], {
        encoding: "utf8",
        env: {
          ...process.env,
          GITHUB_STEP_SUMMARY: summary,
          RELEASE_TAG: "cli-v1.2.3",
          RELEASE_VERSION: "1.2.3",
          RELEASE_COMMIT: "a".repeat(40),
          PUBLICATION: '{"artifacts":"succeeded","npm":"succeeded","tap":"succeeded"}',
          DISTRIBUTION: scenario.distribution,
          PROMOTION: scenario.promotion,
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
