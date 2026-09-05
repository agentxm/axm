import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import { collectCommandAliases } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";

export const specification = defineSpecification({
  requirement: "cli/commands-have-no-alias-routes",
  title: "No command is reachable through an alias route",
  statement:
    "Before public launch, no supported command shall be reachable through an alias route; each command shall answer to exactly one invocation path.",
  class: "constraint",
  role: "experience",
  goals: ["knowledge-access"],
  methods: ["model"],
  derivedFrom: ["cli/command-help-is-complete-and-alias-free"],
  supersedes: ["cli/command-help-is-complete-and-alias-free"],
  assumptions: [],
  openQuestions: [
    "The alias prohibition is phrased as a pre-launch condition in its scenario; whether alias routes stay prohibited after public launch is unresolved.",
  ],
  limitations: [
    {
      limitation:
        "The evidence establishes the pre-launch command surface only; it cannot establish whether alias routes remain prohibited after public launch.",
      retirementCondition:
        "Public launch, when the alias-route policy is decided and this specification is revised or retired.",
    },
  ],
});

describe("Command alias routes", () => {
  it.effect("no registered command carries an alias route before launch", () =>
    Effect.gen(function* () {
      const aliases = yield* collectCommandAliases();
      expect(aliases).toEqual(new Map());
    }),
  );
});
