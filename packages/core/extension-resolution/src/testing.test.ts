import { describe, expect } from "vitest";
import { it } from "@effect/vitest";

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { AxmSkillCompatibilityPolicy } from "./axm-skill-compatibility.js";
import { ReleaseAgePosture } from "./release-age-posture.js";
import {
  AxmSkillCompatibilityPolicyTest,
  ReleaseAgePostureTest,
  exactVersion,
  extensionName,
  handle,
  versionRange,
} from "./testing.js";

describe("@agentxm/extension-resolution/testing", () => {
  it.effect("composes the posture and policy a resolution keeps in R", () =>
    Effect.gen(function* () {
      expect(yield* ReleaseAgePosture).toBe("ignore");
      const policy = yield* AxmSkillCompatibilityPolicy;
      // Only the official skill is the policy's business; anything else is
      // outside its scope and reports no verdict at all.
      expect(
        policy.evaluate({
          fqn: "@acme/skills/review",
          candidate: null,
        }),
      ).toBeNull();
    }).pipe(
      Effect.provide(
        Layer.mergeAll(ReleaseAgePostureTest("ignore"), AxmSkillCompatibilityPolicyTest("0.28.12")),
      ),
    ),
  );

  it("round-trips the branded values a fixture states", () => {
    expect(handle("@acme")).toBe("@acme");
    expect(extensionName("review")).toBe("review");
    expect(exactVersion("1.2.3")).toBe("1.2.3");
    expect(versionRange("^1.2.0")).toBe("^1.2.0");
  });
});
