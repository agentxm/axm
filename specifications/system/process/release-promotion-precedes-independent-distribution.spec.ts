import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";

export const specification = defineSpecification({
  requirement: "system/process/release-promotion-precedes-independent-distribution",
  title: "Stable promotion precedes independent distribution",
  statement:
    "The canonical release workflow shall upload and validate immutable GitHub assets, then either promote their release coordinate through the conditionally written stable channel or, only during an explicit recovery rerun, verify that the strong-ETag stable channel already names that exact coordinate, and only then publish npm packages or update Homebrew; a normal recovery rerun shall preserve any newer promoted channel.",
  class: "process",
  role: "supporting",
  goals: ["trustworthy-distribution", "dependable-change-process"],
  boundary: "repository",
  boundaryRationale:
    "The workflow and its Nx-owned promotion entry point are the committed ordering and recovery controls for public release distribution.",
  methods: ["contract"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [
    "The Control API validates the immutable GitHub asset set before changing the public channel object.",
  ],
  openQuestions: [],
});

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");

describe("Release promotion ordering", () => {
  it.effect("gates distribution on promotion or exact pre-promoted recovery", () =>
    Effect.sync(() => {
      const workflow = fs.readFileSync(
        path.join(repoRoot, ".github", "workflows", "publish.yml"),
        "utf8",
      );
      const upload = workflow.indexOf("Attach binaries and checksums");
      const verifyPromoted = workflow.indexOf("Verify pre-promoted stable release channel");
      const promote = workflow.indexOf("Promote stable release channel");
      const npm = workflow.indexOf("Pack and publish npm packages");
      const homebrew = workflow.indexOf("Update Homebrew formula");
      expect(upload).toBeGreaterThan(0);
      expect(verifyPromoted).toBeGreaterThan(upload);
      expect(promote).toBeGreaterThan(upload);
      expect(npm).toBeGreaterThan(promote);
      expect(npm).toBeGreaterThan(verifyPromoted);
      expect(homebrew).toBeGreaterThan(npm);
      expect(workflow).toContain("axm:promote-release-channel");
      expect(workflow).toContain("inputs.channel_already_promoted == true");
      expect(workflow).toContain("inputs.channel_already_promoted != true");
      expect(workflow).toContain("Accept-Encoding: identity");
      expect(workflow).toContain(".release.commit == $commit");
    }),
  );
});
