import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { readReleaseWorkflow, readReleaseWorkflowTriggers } from "./release-workflow-graph.js";

export const specification = defineSpecification({
  requirement: "system/process/releases-publish-through-canonical-workflow",
  title: "One automated workflow publishes releases",
  statement:
    "Release artifacts shall be published only by the canonical publish.yml workflow, automatically after successful exact merged-revision CI or through its explicit recovery and bootstrap-prerelease modes, and no other workflow shall publish release artifacts.",
  class: "process",
  role: "supporting",
  goals: ["dependable-change-process", "trustworthy-distribution"],
  boundary: "repository",
  boundaryRationale:
    "Only the committed workflow files show which workflow publishes releases, what triggers it, and that no other workflow does.",
  methods: ["contract"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [
    "Publishing credentials are available only to the canonical workflow, so no manual or external path can publish release artifacts.",
  ],
  openQuestions: [],
});

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const workflowsDirectory = path.join(repoRoot, ".github", "workflows");

/**
 * What publishing a release artifact actually looks like in a workflow: the
 * distribution and promotion entry points, the credentials only the canonical
 * workflow may hold, and the tap token that writes the public formula. A
 * second workflow that published releases would have to carry at least one of
 * these, whatever it called its own job.
 */
const PUBLICATION_SIGNALS = [
  "axm:distribute-release",
  "axm:publish-bootstrap-prerelease",
  "axm:reconcile-github-release",
  "axm:promote-release-channel",
  "axm:update-homebrew-formula",
  "HOMEBREW_TAP_TOKEN",
  "AXM_RELEASE_CONTROL_TOKEN",
] as const;

describe("Canonical release workflow", () => {
  it.effect("continues merged release CI and exposes only bounded manual modes", () =>
    Effect.sync(() => {
      const triggers = readReleaseWorkflowTriggers();
      expect(triggers.workflow_run).toEqual({ workflows: ["CI"], types: ["completed"] });
      expect(Object.keys(triggers.workflow_dispatch.inputs)).toEqual([
        "mode",
        "release_tag",
        "source_sha",
      ]);
      expect(triggers.workflow_dispatch.inputs["mode"]).toMatchObject({
        required: true,
        options: ["stable-recovery", "bootstrap-prerelease"],
      });
      expect(Object.keys(triggers)).toEqual(["workflow_run", "workflow_dispatch"]);
    }),
  );

  it.effect("validates the release asset set before it distributes anything", () =>
    Effect.sync(() => {
      const release = readReleaseWorkflow().jobs["release"];
      if (release === undefined) throw new Error("publish.yml must declare the `release` job");
      const steps = release.steps.map((step) => step.run ?? "");
      const validated = steps.findIndex((run) => run.includes("axm:validate-release-assets"));
      const npmValidated = steps.findIndex((run) => run.includes("axm:validate-release-cohort"));
      const prepared = steps.findIndex(
        (run) => run.includes("axm:reconcile-github-release") && run.includes("prepare"),
      );
      const distributed = steps.findIndex(
        (run, index) => index > prepared && run.includes("axm:distribute-release"),
      );
      expect(validated).toBeGreaterThan(-1);
      expect(npmValidated).toBeGreaterThan(validated);
      expect(prepared).toBeGreaterThan(npmValidated);
      expect(distributed).toBeGreaterThan(prepared);
    }),
  );

  it.effect("accepts automation authority only from successful main push CI", () =>
    Effect.sync(() => {
      const workflow = readReleaseWorkflow();
      const source = workflow.jobs["source"];
      if (source === undefined) throw new Error("publish.yml must declare the `source` job");
      expect(source.if).toContain("workflow_run.conclusion == 'success'");
      expect(source.if).toContain("workflow_run.event == 'push'");
      expect(source.if).toContain("workflow_run.head_branch == 'main'");
      expect(
        source.steps.some(
          (step) =>
            step.run?.includes("git log origin/main") === true &&
            step.run.includes("Expected exactly one canonical release commit"),
        ),
      ).toBe(true);
      expect(workflow.jobs["release"]?.needs).toBe("source");
      expect(workflow.jobs["release"]?.steps[0]?.with?.["ref"]).toBe(
        "${{ needs.source.outputs.tooling_sha }}",
      );
      expect(
        workflow.jobs["release"]?.steps.some(
          (step) =>
            step.run?.includes("axm:resolve-release-meta") === true &&
            step.run.includes("needs.source.outputs.sha"),
        ),
      ).toBe(true);
    }),
  );

  it.effect("owns the bootstrap prerelease and exact installation check", () =>
    Effect.sync(() => {
      const workflow = readReleaseWorkflow();
      const bootstrap = workflow.jobs["bootstrap-prerelease"];
      const verification = workflow.jobs["bootstrap-prerelease-verify"];
      expect(
        bootstrap?.steps.some((step) => step.run?.includes("publish-bootstrap-prerelease")),
      ).toBe(true);
      expect(
        verification?.steps.some(
          (step) =>
            step.run?.includes("npm install --global") && step.run.includes("axm --version"),
        ),
      ).toBe(true);
    }),
  );

  it.effect("no other workflow carries a release-publication signal", () =>
    Effect.sync(() => {
      const others = fs
        .readdirSync(workflowsDirectory)
        .filter((file) => file !== "publish.yml" && /\.ya?ml$/u.test(file))
        .sort();
      expect(others.length).toBeGreaterThan(0);
      const carried = others.flatMap((file) => {
        const text = fs.readFileSync(path.join(workflowsDirectory, file), "utf8");
        return PUBLICATION_SIGNALS.filter((signal) => text.includes(signal)).map(
          (signal) => `${file}: ${signal}`,
        );
      });
      expect(carried).toEqual([]);
    }),
  );
});
