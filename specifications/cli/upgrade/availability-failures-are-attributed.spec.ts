import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import type { CommandResult } from "axm.sh/specification-harness";
import { LOCAL_VERSION, TARGET_VERSION, runUpgrade } from "../../support/upgrade-harness.js";

export const specification = defineSpecification({
  requirement: "cli/upgrade/availability-failures-are-attributed",
  title: "Availability outcomes retain the observed reason",
  statement:
    "When installer preparation or availability blocks an upgrade, human and machine results shall agree with the recorded observation, distinguish affirmative absence from indeterminate failure and formula version mismatch, and report mutation and verification as not attempted.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics", "machine-automation"],
  methods: ["example"],
  derivedFrom: ["cli/upgrade/machine-result-is-upgrade-assessment"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const failed: CommandResult = {
  executionState: "exited",
  exitCode: 1,
  stdout: "",
  stderr: "fixture command failure",
};
const timedOut: CommandResult = { ...failed, executionState: "timed-out", exitCode: null };
const cases = [
  {
    command: "tap",
    response: failed,
    state: "indeterminate",
    reason: "tap-query-failed",
    message: "ownership preparation failed",
  },
  {
    command: "update",
    response: failed,
    state: "indeterminate",
    reason: "refresh-failed",
    message: "metadata refresh failed",
  },
  {
    command: "update",
    response: timedOut,
    state: "indeterminate",
    reason: "refresh-failed",
    message: "metadata refresh failed",
  },
  {
    command: "info",
    response: timedOut,
    state: "indeterminate",
    reason: "formula-query-failed",
    message: "availability could not be verified",
  },
  {
    command: "info",
    response: { ...failed, exitCode: 0, stdout: "malformed" },
    state: "indeterminate",
    reason: "formula-query-failed",
    message: "availability could not be verified",
  },
  {
    command: "info",
    response: { ...failed, exitCode: 0, stdout: '{"formulae":[]}' },
    state: "unavailable",
    reason: "target-formula-unavailable",
    message: `does not expose selected AXM ${TARGET_VERSION}`,
  },
] as const;

describe("Availability diagnosis", () => {
  it.effect.each(cases)("attributes $command $response.executionState as $state", (scenario) =>
    Effect.gen(function* () {
      const options = {
        respond: (call: { readonly args: ReadonlyArray<string> }) =>
          call.args[0] === scenario.command ? scenario.response : undefined,
      };
      const machine = yield* runUpgrade(options);
      const human = yield* runUpgrade({ ...options, human: true });
      expect(machine.document).toMatchObject({
        result: {
          outcome: "failed",
          disposition: `installer-${scenario.state}`,
          installerAvailability: { state: scenario.state, observedVersion: null },
          details: { homebrewFailure: scenario.reason },
          message: expect.stringContaining(scenario.message),
          mutation: { state: "not-attempted" },
          verification: { state: "not-attempted" },
          commands: expect.arrayContaining([
            expect.objectContaining({
              args: expect.arrayContaining([scenario.command]),
              executionState: scenario.response.executionState,
            }),
          ]),
        },
      });
      expect(human.humanOutput).toContain(scenario.message);
      expect(
        machine.calls.some((call) => ["upgrade", "reinstall"].includes(call.args[0] ?? "")),
      ).toBe(false);
    }),
  );
  it.effect.each([
    { version: LOCAL_VERSION, state: "lagging", text: "is behind" },
    { version: "1000.0.0", state: "leading", text: "is ahead" },
  ])("reports formula $state with both versions", (scenario) =>
    Effect.gen(function* () {
      const machine = yield* runUpgrade({ formulaVersion: scenario.version });
      const human = yield* runUpgrade({ formulaVersion: scenario.version, human: true });
      expect(machine.document).toMatchObject({
        result: {
          disposition: `installer-${scenario.state}`,
          details: {
            homebrewFailure:
              scenario.state === "lagging"
                ? "target-formula-unavailable"
                : "formula-ahead-of-target",
            observedFormulaVersion: scenario.version,
          },
          mutation: { state: "not-attempted" },
          verification: { state: "not-attempted" },
          message: expect.stringContaining(scenario.text),
        },
      });
      if (scenario.state === "lagging") {
        expect(machine.document).toMatchObject({
          result: { recovery: { recommendedCommand: null } },
        });
      }
      expect(human.humanOutput).toContain(scenario.text);
      expect(human.humanOutput).toContain(scenario.version);
      expect(human.humanOutput).toContain(TARGET_VERSION);
    }),
  );
});
