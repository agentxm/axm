import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { afterEach, beforeEach, vi } from "vitest";
import { authCredentialFile, makeAuthSpecContext } from "../../../support/auth-harness.js";
beforeEach(() => {
  vi.stubEnv("AXM_TOKEN", "");
  vi.stubEnv("AXM_TOKEN_FILE", "");
});
afterEach(() => vi.unstubAllEnvs());
import { RegistryAuthFailed } from "axm.sh/specification-harness";
import { getAppError, handleRevokeToken } from "axm.sh/specification-harness";

export const specification = defineSpecification({
  requirement: "cli/token/revoke/revokes-only-selected-token",
  title: "Token revocation names the selected credential",
  statement:
    "When token revoke is requested, AXM shall request deletion of the selected token identifier using the effective credential and report success only after the Registry accepts deletion.",
  class: "functional",
  role: "experience",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["packages/cli/src/root/auth/token.internal.test.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Token revocation", () => {
  for (const accepted of [true, false]) {
    it.effect(accepted ? "accepted deletion" : "refused deletion", () => {
      const requests: unknown[] = [];
      const context = makeAuthSpecContext({
        credentials: authCredentialFile,
        auth: {
          deleteToken: (token, id) =>
            Effect.gen(function* () {
              requests.push({ token, id });
              if (!accepted)
                return yield* new RegistryAuthFailed({
                  category: "auth",
                  detail: "Fixture refusal",
                });
            }),
        },
      });
      return context.provide(
        Effect.gen(function* () {
          if (accepted) {
            yield* handleRevokeToken("selected-token");
            expect(context.rendererState.results[0]?.data).toMatchObject({
              result: { status: "revoked", tokenId: "selected-token" },
            });
          } else {
            const failure = yield* handleRevokeToken("selected-token").pipe(Effect.flip);
            expect(getAppError(failure).code).toBe("auth");
            expect(context.rendererState.results).toEqual([]);
          }
          expect(requests).toEqual([{ token: "fixture-stored-access", id: "selected-token" }]);
        }),
      );
    });
  }
});
