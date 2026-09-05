import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { LOCAL_VERSION, TARGET_VERSION, runUpgrade } from "../../support/upgrade-harness.js";

export const specification = defineSpecification({
  requirement: "cli/upgrade/homebrew-checks-availability-once",
  title: "Homebrew checks selected-version availability once",
  statement:
    "When a Homebrew-owned installation requires mutation, upgrade shall perform at most one explicit metadata refresh and one formula query with their own command timeouts, then either proceed on an exact match or stop without publication polling.",
  class: "functional",
  role: "experience",
  goals: ["trustworthy-distribution", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["cli/upgrade/installer-availability-gates-mutation"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Homebrew availability observation", () => {
  it.effect.each([0, 5_000])(
    "returns formula lag after one healthy refresh lasting %i milliseconds",
    (delay) =>
      Effect.gen(function* () {
        const { document, calls, events } = yield* runUpgrade({
          formulaVersion: LOCAL_VERSION,
          refreshDelayMs: delay,
          advanceMs: delay,
        });
        expect(document).toMatchObject({
          result: {
            outcome: "failed",
            disposition: "installer-lagging",
            installerAvailability: { state: "lagging", observedVersion: LOCAL_VERSION },
            mutation: { state: "not-attempted" },
            verification: { state: "not-attempted" },
          },
        });
        const refreshes = calls.filter((call) => call.args[0] === "update");
        expect(refreshes).toHaveLength(1);
        expect(refreshes[0]?.options?.timeoutMs).toBeUndefined();
        expect(calls.filter((call) => call.args[0] === "info")).toHaveLength(1);
        expect(calls.some((call) => ["upgrade", "reinstall"].includes(call.args[0] ?? ""))).toBe(
          false,
        );
        expect(
          events.filter((event) => event._tag === "Waiting" || event._tag === "WaitEnded"),
        ).toEqual([]);
        expect(JSON.stringify(document)).not.toContain("90 seconds");
      }),
  );
  it.effect("leaves preview and already-current requests free of installer commands", () =>
    Effect.gen(function* () {
      expect((yield* runUpgrade({ dryRun: true })).calls).toEqual([]);
      expect((yield* runUpgrade({ localVersion: TARGET_VERSION })).calls).toEqual([]);
    }),
  );
});
