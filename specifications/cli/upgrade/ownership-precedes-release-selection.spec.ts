import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { Unknown, getAppError } from "axm.sh/specification-harness";
import { makeUpgradeExecution } from "../../support/upgrade-execution-fixture.js";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";

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
          const upgrade = makeUpgradeExecution({ method: new Unknown({ reason: "ambiguous" }) });
          const failure = yield* upgrade
            .run({
              reinstall: false,
              ...(requestedVersion === undefined ? {} : { requestedVersion }),
            })
            .pipe(Effect.flip);
          const error = getAppError(failure);
          expect(error.code).toBe("validation");
          expect(error.detail).toContain("Could not determine how AXM was installed");
          expect(upgrade.requests).toEqual([]);
          expect(upgrade.calls).toEqual([]);
          expect(upgrade.metadata).toEqual([]);
        }),
    );
});
