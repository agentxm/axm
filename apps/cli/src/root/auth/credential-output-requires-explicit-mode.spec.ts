import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";

import { getAppError } from "../../test-support/test-helpers.js";
import { makeTokenSpecContext } from "../../test-support/token-harness.js";
import { handleToken } from "./token.js";

export const specification = defineSpecification({
  requirement: "cli/token/credential-output-requires-explicit-mode",
  title: "Credential export needs an explicit, secret-safe output mode",
  statement:
    "When axm token show is asked for JSON output, or without --plain while stdout is not an interactive terminal, AXM shall report a usage failure before resolving or refreshing any credential, and shall write no credential.",
  class: "constraint",
  characteristic: "security",
  role: "interface",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["apps/cli/src/root/auth/token.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const refusals = [
  { name: "JSON output", options: { json: true }, plain: undefined },
  { name: "JSON output with human mode", options: { json: true }, plain: false },
  { name: "no output mode for a pipe", options: {}, plain: undefined },
  { name: "human output for a pipe", options: {}, plain: false },
] as const;

describe("Credential output admission", () => {
  for (const { name, options, plain } of refusals) {
    it.effect(`token show: ${name}`, () => {
      // Signed out: a credential lookup before admission would surface as
      // an authentication failure instead of a usage failure.
      const context = makeTokenSpecContext({ ...options, signedIn: false });
      const args = plain === undefined ? {} : { plain };
      return Effect.gen(function* () {
        const failure = yield* handleToken(args).pipe(Effect.flip);

        expect(getAppError(failure).code).toBe("usage");
        expect(context.state.credentials).toEqual([]);
        expect(context.state.results).toEqual([]);
      }).pipe(Effect.provide(context.layer));
    });
  }
});
