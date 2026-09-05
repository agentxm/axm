import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { afterEach, vi } from "vitest";
import { handleToken } from "axm.sh/specification-harness";
import { authCredentialFile, makeAuthSpecContext } from "../../support/auth-harness.js";
afterEach(() => vi.unstubAllEnvs());

export const specification = defineSpecification({
  requirement: "cli/token/returns-effective-token",
  title: "Token output exposes the effective credential on request",
  statement:
    "When a credential is available, axm token shall return that credential alone as text by default or as a structured token value when JSON output is requested.",
  class: "functional",
  role: "interface",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["packages/cli/src/root/auth/token.internal.test.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Explicit token output", () => {
  for (const machine of [false, true]) {
    it.effect(machine ? "structured token" : "raw token", () => {
      vi.stubEnv("AXM_TOKEN", "");
      vi.stubEnv("AXM_TOKEN_FILE", "");
      const context = makeAuthSpecContext({ machine, credentials: authCredentialFile });
      return context.provide(
        Effect.gen(function* () {
          yield* handleToken();
          if (machine)
            expect(context.rendererState.results[0]?.data).toEqual({
              data: { token: "fixture-stored-access" },
            });
          else
            expect(context.rendererState.logs).toEqual([
              { _tag: "message", message: "fixture-stored-access\n" },
            ]);
        }),
      );
    });
  }
});
