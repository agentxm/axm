import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";

import { SESSION_ACCESS_TOKEN, makeTokenSpecContext } from "../../test-support/token-harness.js";
import { handleToken } from "./token.js";

export const specification = defineSpecification({
  requirement: "cli/token/returns-effective-token",
  title: "Token output exposes the effective credential on request",
  statement:
    "When a credential is available and raw token output is requested or stdout is an interactive terminal, axm token shall write that credential alone, followed by one newline, to stdout and nothing else there.",
  class: "functional",
  role: "interface",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["apps/cli/src/root/auth/token.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Explicit token output", () => {
  for (const mode of ["raw output for a pipe", "interactive terminal"] as const) {
    it.effect(mode, () => {
      const context = makeTokenSpecContext({ interactive: mode === "interactive terminal" });
      return Effect.gen(function* () {
        yield* handleToken(mode === "interactive terminal" ? {} : { output: "token" });

        expect(context.state.credentials).toEqual([`${SESSION_ACCESS_TOKEN}\n`]);
        expect(context.state.results).toEqual([]);
        expect(context.state.docs.filter((entry) => entry.channel === "stdout")).toEqual([]);
        expect(context.stderr()).not.toContain(SESSION_ACCESS_TOKEN);
      }).pipe(Effect.provide(context.layer));
    });
  }
});
