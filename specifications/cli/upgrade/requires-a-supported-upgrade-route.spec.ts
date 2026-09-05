import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as Effect from "effect/Effect";
import { Yarn } from "axm.sh/specification-harness";
import { makeUpgradeExecution } from "../../support/upgrade-execution-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/upgrade/requires-a-supported-upgrade-route",
  title: "Unsupported upgrade routes require explicit recovery",
  statement:
    "When an installation is owned by a manager that AXM cannot use for in-place upgrade, AXM shall leave that installation unchanged and report an explicit recovery route without silently delegating to another manager.",
  class: "functional",
  role: "experience",
  goals: ["trustworthy-distribution", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["packages/cli/src/root/upgrade/handler.internal.test.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Unsupported in-place upgrade route", () => {
  it.effect("keeps an unsupported Yarn-owned installation and names recovery", () =>
    Effect.gen(function* () {
      const upgrade = makeUpgradeExecution({
        method: new Yarn({
          importUrl: "file:///controlled/yarn/axm",
          managerMajorVersion: 4,
          supported: false,
        }),
      });
      yield* upgrade.run();
      expect(upgrade.document().result).toMatchObject({
        outcome: "failed",
        disposition: "recovery-required",
        ownership: { method: "yarn" },
        mutation: { state: "not-attempted" },
      });
      expect(upgrade.document().result.recovery.recommendedCommand).not.toBeNull();
      expect(upgrade.calls).toEqual([]);
      expect(upgrade.metadata).toEqual([]);
    }),
  );
});
