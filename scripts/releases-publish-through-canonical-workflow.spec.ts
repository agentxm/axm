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
    "Release artifacts shall be published only by the canonical publish.yml workflow, triggered by a published release or an explicit release tag and validating release assets before completion, and no other workflow shall publish release artifacts.",
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
  "axm:release-publish",
  "axm:promote-release-channel",
  "axm:update-homebrew-formula",
  "HOMEBREW_TAP_TOKEN",
  "AXM_RELEASE_CONTROL_TOKEN",
] as const;

describe("Canonical release workflow", () => {
  it.effect("publishes only for a published release or an explicitly named release tag", () =>
    Effect.sync(() => {
      const triggers = readReleaseWorkflowTriggers();
      // A published release is the ordinary path; a rerun names an existing
      // tag through workflow_dispatch and stays inside this same workflow.
      expect(triggers.release.types).toEqual(["published"]);
      expect(Object.keys(triggers.workflow_dispatch.inputs)).toEqual(["release_tag"]);
      expect(triggers.workflow_dispatch.inputs["release_tag"]).toMatchObject({ required: true });
      expect(Object.keys(triggers)).toEqual(["release", "workflow_dispatch"]);
    }),
  );

  it.effect("validates the release asset set before it distributes anything", () =>
    Effect.sync(() => {
      const release = readReleaseWorkflow().jobs["release"];
      if (release === undefined) throw new Error("publish.yml must declare the `release` job");
      const steps = release.steps.map((step) => step.run ?? "");
      const validated = steps.findIndex((run) => run.includes("axm:validate-release-assets"));
      const distributed = steps.findIndex((run) => run.includes("axm:distribute-release"));
      expect(validated).toBeGreaterThan(-1);
      expect(distributed).toBeGreaterThan(validated);
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
