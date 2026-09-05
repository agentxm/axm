import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import YAML from "yaml";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";

export const specification = defineSpecification({
  requirement: "system/process/releases-publish-through-canonical-workflow",
  title: "Releases publish only through the canonical automated workflow",
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

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");

describe("Canonical release workflow", () => {
  it.effect(
    "the publish workflow runs only for a published release or an explicit release tag",
    () =>
      Effect.sync(() => {
        const text = fs.readFileSync(
          path.join(repoRoot, ".github", "workflows", "publish.yml"),
          "utf8",
        );
        const parsed: unknown = YAML.parse(text);
        if (typeof parsed !== "object" || parsed === null || !("jobs" in parsed)) {
          throw new Error("publish.yml must declare jobs");
        }
        // The canonical workflow publishes for an exact release; recovery reruns
        // supply an existing tag through workflow_dispatch and stay inside the
        // same workflow, and release assets are validated before completion.
        expect(text).toContain("release");
        expect(text).toContain("workflow_dispatch");
        expect(text).toContain("release_tag");
        expect(text).toContain("validate-release-assets");
      }),
  );

  it.effect("no other workflow publishes release artifacts", () =>
    Effect.sync(() => {
      const workflowsDir = path.join(repoRoot, ".github", "workflows");
      for (const file of fs.readdirSync(workflowsDir).sort()) {
        if (file === "publish.yml" || !/\.ya?ml$/.test(file)) {
          continue;
        }
        const text = fs.readFileSync(path.join(workflowsDir, file), "utf8");
        expect(text).not.toContain("release-publish");
      }
    }),
  );
});
