import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";

import { getAppError } from "../../test-support/test-helpers.js";
import { makeTokenSpecContext } from "../../test-support/token-harness.js";
import { handleCreateToken, handleToken } from "./token.js";

export const specification = defineSpecification({
  requirement: "cli/token/credential-output-requires-explicit-mode",
  title: "Credential export needs an explicit, secret-safe output mode",
  statement:
    "When axm token or axm token create is asked for JSON output, for human output outside an interactive terminal, or for no output mode while stdout is not an interactive terminal, AXM shall report a usage failure before resolving, refreshing, or creating any credential, and shall write no credential.",
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
  { name: "JSON output", options: { json: true }, output: undefined },
  { name: "JSON output with human mode", options: { json: true }, output: "human" },
  { name: "no output mode for a pipe", options: {}, output: undefined },
  { name: "human output for a pipe", options: {}, output: "human" },
] as const;

const createArgs = {
  name: "ci",
  expires: "30d",
  owners: [],
  extensions: [],
  permission: "read",
} as const;

describe("Credential output admission", () => {
  for (const { name, options, output } of refusals) {
    for (const command of ["token", "token create"] as const) {
      it.effect(`${command}: ${name}`, () => {
        // Signed out: a credential lookup before admission would surface as
        // an authentication failure instead of a usage failure.
        const context = makeTokenSpecContext({ ...options, signedIn: false });
        const args = output === undefined ? {} : { output };
        return Effect.gen(function* () {
          const failure = yield* (
            command === "token" ? handleToken(args) : handleCreateToken({ ...createArgs, ...args })
          ).pipe(Effect.flip);

          expect(getAppError(failure).code).toBe("usage");
          expect(context.creations).toEqual([]);
          expect(context.state.credentials).toEqual([]);
          expect(context.state.results).toEqual([]);
        }).pipe(Effect.provide(context.layer));
      });
    }
  }
});
