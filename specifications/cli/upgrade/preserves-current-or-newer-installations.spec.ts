import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as Effect from "effect/Effect";
import { Npm } from "axm.sh/specification-harness";
import { makeUpgradeExecution } from "../../support/upgrade-execution-fixture.js";
import { TARGET_VERSION } from "../../support/upgrade-harness.js";

export const specification = defineSpecification({
  requirement: "cli/upgrade/preserves-current-or-newer-installations",
  title:
    "Upgrade preserves current and newer installations unless equal-version reinstall is requested",
  statement:
    "AXM shall leave an equal or newer installation unchanged unless equal-version reinstallation is explicitly requested, and shall refuse a downgrade even when reinstallation is requested.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "trustworthy-distribution"],
  methods: ["example"],
  derivedFrom: [
    "packages/cli/src/root/upgrade/upgrade.ts",
    "packages/cli/src/root/upgrade/handler.internal.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Upgrade version relationships", () => {
  for (const scenario of [
    {
      localVersion: TARGET_VERSION,
      reinstall: false,
      outcome: "no-op",
      disposition: "already-current",
      delegated: false,
    },
    {
      localVersion: TARGET_VERSION,
      reinstall: true,
      outcome: "applied",
      disposition: "reinstalled",
      delegated: true,
    },
    {
      localVersion: "1000.0.0",
      reinstall: false,
      outcome: "no-op",
      disposition: "local-newer",
      delegated: false,
    },
    {
      localVersion: "1000.0.0",
      reinstall: true,
      outcome: "failed",
      disposition: "downgrade-refused",
      delegated: false,
    },
  ])
    it.effect(
      `assesses version ${scenario.localVersion} with reinstall=${scenario.reinstall}`,
      () =>
        Effect.gen(function* () {
          const upgrade = makeUpgradeExecution({
            method: new Npm({
              importUrl: "file:///controlled/npm/axm",
              managerOwnedExecutable: "/controlled/npm/axm",
            }),
          });
          yield* upgrade.run({
            reinstall: scenario.reinstall,
            localVersion: scenario.localVersion,
          });
          expect(upgrade.document().result).toMatchObject({
            outcome: scenario.outcome,
            disposition: scenario.disposition,
            mutation: { state: scenario.delegated ? "updated" : "not-attempted" },
          });
          expect(
            upgrade.calls.some((call) => call.executable === "npm" && call.args[0] === "install"),
          ).toBe(scenario.delegated);
          if (!scenario.delegated) expect(upgrade.metadata).toEqual([]);
        }),
    );
});
