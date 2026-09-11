import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import * as NodeServices from "@effect/platform-node/NodeServices";

import { LOCAL_VERSION, runUpgradeTrial } from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/upgrade/homebrew-checks-availability-once",
  title: "Homebrew checks selected-version availability once",
  statement:
    "When a Homebrew-owned installation requires mutation, upgrade shall perform at most one explicit metadata refresh and one formula query, then either proceed on an exact match or stop without polling for publication.",
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
        const { assessment, calls, events } = yield* runUpgradeTrial({
          formulaVersion: LOCAL_VERSION,
          refreshDelayMs: delay,
          advanceMs: delay,
        });
        expect(assessment).toMatchObject({
          outcome: "failed",
          disposition: "installer-lagging",
          installerAvailability: { state: "lagging", observedVersion: LOCAL_VERSION },
          mutation: { state: "not-attempted" },
          verification: { state: "not-attempted" },
        });
        expect(calls.filter((call) => call.args[0] === "update")).toHaveLength(1);
        expect(calls.filter((call) => call.args[0] === "info")).toHaveLength(1);
        expect(calls.some((call) => ["upgrade", "reinstall"].includes(call.args[0] ?? ""))).toBe(
          false,
        );
        expect(
          events.filter((event) => event._tag === "Waiting" || event._tag === "WaitEnded"),
        ).toEqual([]);
      }).pipe(Effect.provide(NodeServices.layer)),
  );
});
