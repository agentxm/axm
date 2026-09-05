import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import {
  defineBoundEvidence,
  defineSpecification,
} from "@agentxm/extension-model/unstable/specifications";

export const specification = defineSpecification({
  requirement: "system/process/release-promotion-validates-public-validators",
  title: "Release promotion checks public validators before conditional updates",
  statement:
    "Before conditionally updating an existing stable channel, release promotion shall verify that public reads negotiating identity, gzip, Brotli, and Zstandard return the same strong ETag and untransformed document, and shall perform no mutation if any read fails or disagrees.",
  class: "process",
  role: "supporting",
  goals: ["trustworthy-distribution", "dependable-change-process"],
  boundary: "repository",
  boundaryRationale:
    "The committed promotion entry point owns this release gate; bound tooling tests drive its network boundary with controlled responses without publishing a release.",
  methods: ["contract"],
  derivedFrom: ["system/process/release-promotion-precedes-independent-distribution"],
  supersedes: [],
  assumptions: [
    "A concurrent channel change may invalidate the preflight and requires a new invocation.",
  ],
  openQuestions: [],
});

export const boundEvidence = defineBoundEvidence([
  {
    gate: "test: axm:test (scripts/release-channel-promotion.tooling.test.ts)",
    verifies:
      "Exercises identity, gzip, Brotli, and Zstandard public reads before the Control PUT, rejects weak or absent validators, transformation, inconsistent validators or documents, and failed reads without mutation, and preserves conditional creation and newer-channel retention.",
  },
]);

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");

describe("Public release validator preflight", () => {
  it.effect("the promotion entry point gates its mutation on representation verification", () =>
    Effect.sync(() => {
      const source = fs.readFileSync(
        path.join(repoRoot, "scripts/release-channel-promotion.ts"),
        "utf8",
      );
      const verification = source.indexOf("await verifyStableChannelRepresentations(");
      const mutation = source.indexOf("fetchImplementation(RELEASE_CHANNEL_CONTROL_URL");
      expect(verification).toBeGreaterThan(0);
      expect(mutation).toBeGreaterThan(verification);
    }),
  );
});
