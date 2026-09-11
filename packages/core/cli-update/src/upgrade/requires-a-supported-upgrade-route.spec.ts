import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";

import { Yarn } from "../install-method/install-method.js";
import { runUpgradeTrial } from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/upgrade/requires-a-supported-upgrade-route",
  title: "Unsupported upgrade routes require explicit recovery",
  statement:
    "When an installation is owned by a manager that AXM cannot use for in-place upgrade, AXM shall leave that installation unchanged and report an explicit recovery route without silently delegating to another manager.",
  class: "functional",
  role: "experience",
  goals: ["trustworthy-distribution", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Unsupported in-place upgrade route", () => {
  it.effect("keeps an unsupported Yarn-owned installation and names recovery", () =>
    Effect.gen(function* () {
      const upgrade = yield* runUpgradeTrial({
        method: new Yarn({
          importUrl: "file:///controlled/yarn/axm",
          managerMajorVersion: 4,
          supported: false,
        }),
      });
      expect(upgrade.assessment).toMatchObject({
        outcome: "failed",
        disposition: "recovery-required",
        ownership: { method: "yarn" },
        mutation: { state: "not-attempted" },
      });
      expect(upgrade.assessment.recovery.recommendedCommand).not.toBeNull();
      expect(upgrade.calls).toEqual([]);
      expect(upgrade.installMetaWrites).toEqual([]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
