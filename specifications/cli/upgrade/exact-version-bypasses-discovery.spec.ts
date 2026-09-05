import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import { resolveExactVersion } from "axm.sh/specification-harness";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";

export const specification = defineSpecification({
  requirement: "cli/upgrade/exact-version-bypasses-discovery",
  title: "Exact upgrade bypasses release discovery",
  statement:
    "An upgrade naming a normalized stable semantic version shall derive its immutable GitHub Release coordinate without discovery, and shall reject leading-v, prerelease, or non-normalized versions before mutation.",
  class: "functional",
  role: "experience",
  goals: ["trustworthy-distribution", "machine-automation"],
  methods: ["decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Exact upgrade selection", () => {
  it.effect("derives the immutable coordinate without a channel document", () =>
    Effect.gen(function* () {
      const result = yield* resolveExactVersion("1.2.3", "1.0.0", "axm-linux-x64");
      expect(result.channel).toBeNull();
      expect(result.release).toEqual({
        tagName: "cli-v1.2.3",
        binaryAssetUrl: "https://github.com/agentxm/axm/releases/download/cli-v1.2.3/axm-linux-x64",
        checksumAssetUrl: "https://github.com/agentxm/axm/releases/download/cli-v1.2.3/SHA256SUMS",
      });
    }),
  );

  it.effect.each(["v1.2.3", "1.2.3-beta.1", "01.2.3"])("rejects %s", (version) =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(resolveExactVersion(version, "1.0.0"));
      expect(error.code).toBe("validation");
    }),
  );
});
