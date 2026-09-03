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
    "The canonical release workflow shall upload and validate immutable GitHub assets, promote their release coordinate through the conditionally written stable channel, and only then publish npm packages or update Homebrew; a recovery rerun shall preserve any newer promoted channel.",
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
  it.effect("places promotion after assets and before npm and Homebrew", () =>
    Effect.sync(() => {
      const workflow = fs.readFileSync(
        path.join(repoRoot, ".github", "workflows", "publish.yml"),
        "utf8",
      );
      const upload = workflow.indexOf("Attach binaries and checksums");
      const promote = workflow.indexOf("Promote stable release channel");
      const npm = workflow.indexOf("Pack and publish npm packages");
      const homebrew = workflow.indexOf("Update Homebrew formula");
      expect(upload).toBeGreaterThan(0);
      expect(promote).toBeGreaterThan(upload);
      expect(npm).toBeGreaterThan(promote);
      expect(homebrew).toBeGreaterThan(npm);
      expect(workflow).toContain("axm:promote-release-channel");
    }),
  );
});
