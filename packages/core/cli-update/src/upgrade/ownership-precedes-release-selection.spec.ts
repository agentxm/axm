import { Unknown } from "@agentxm/cli-maintenance/self-update/domain";
import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";

import { defineSpecification } from "@agentxm/specification-metadata";

import { makeUpgradeTrial } from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/upgrade/ownership-precedes-release-selection",
  title: "Upgrade establishes ownership before release selection",
  statement:
    "Upgrade shall identify the installation owner before performing canonical release selection so unresolved ownership fails without an unnecessary release-authority request and every later availability and mutation decision is installer-specific.",
  class: "constraint",
  role: "supporting",
  goals: ["trustworthy-distribution", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Ownership is resolved before release selection", () => {
  for (const requestedVersion of [undefined, "1.2.3"])
    it.effect(
      `refuses unresolved ownership before ${requestedVersion === undefined ? "latest" : "exact"} release selection`,
      () =>
        Effect.gen(function* () {
          const upgrade = yield* makeUpgradeTrial({
            method: new Unknown({ reason: "ambiguous" }),
            ...(requestedVersion === undefined ? {} : { requestedVersion }),
          });
          const failure = yield* Effect.flip(upgrade.run());
          expect(failure._tag).toBe("UpgradeFailed");
          expect(failure.category).toBe("validation");
          expect(failure.detail).toContain("Could not determine how AXM was installed");
          expect(upgrade.releaseRequests).toEqual([]);
          expect(upgrade.calls).toEqual([]);
          expect(upgrade.installMetaWrites).toEqual([]);
        }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );
});
