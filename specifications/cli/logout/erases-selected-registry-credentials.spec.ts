import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as Option from "effect/Option";
import { CredentialStore, RegistryAuthFailed } from "axm.sh/specification-harness";
import { getAppError, handleLogout, handleToken } from "axm.sh/specification-harness";
import {
  authCredentialFile,
  authRegistry,
  otherAuthRegistry,
  makeAuthSpecContext,
} from "../../support/auth-harness.js";
import { afterEach, beforeEach, vi } from "vitest";
beforeEach(() => {
  vi.stubEnv("AXM_TOKEN", "");
  vi.stubEnv("AXM_TOKEN_FILE", "");
});
afterEach(() => vi.unstubAllEnvs());

export const specification = defineSpecification({
  requirement: "cli/logout/erases-selected-registry-credentials",
  title: "Sign-out removes only the selected Registry session",
  statement:
    "When logout finds saved credentials, AXM shall remove the selected Registry session even if remote revocation fails, leaving other Registry credentials available.",
  class: "functional",
  role: "experience",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["packages/cli/src/root/auth/logout.internal.test.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Local sign-out", () => {
  for (const remoteRevoke of ["succeeds", "fails"] as const) {
    it.effect(remoteRevoke, () => {
      const revoked: string[] = [];
      const context = makeAuthSpecContext({
        credentials: authCredentialFile,
        auth: {
          revokeToken: (token) =>
            Effect.gen(function* () {
              revoked.push(token);
              if (remoteRevoke === "fails")
                return yield* new RegistryAuthFailed({
                  category: "auth",
                  detail: "Fixture Registry unavailable",
                });
            }),
        },
      });
      return context.provide(
        Effect.gen(function* () {
          const credentials = yield* CredentialStore;
          const otherBefore = yield* credentials.load(otherAuthRegistry);
          yield* handleLogout();
          expect(revoked).toEqual(["fixture-stored-refresh"]);
          expect(Option.isNone(yield* credentials.load(authRegistry))).toBe(true);
          expect(yield* credentials.load(otherAuthRegistry)).toEqual(otherBefore);
          const missing = yield* handleToken().pipe(Effect.flip);
          expect(getAppError(missing).code).toBe("auth_required");
          expect(context.rendererState.results[0]?.data).toMatchObject({
            result: {
              status: remoteRevoke === "succeeds" ? "logged-out" : "logged-out-local-only",
              registryHost: "registry.example.test",
              handle: "@alice",
            },
          });
          yield* handleLogout();
          expect(context.rendererState.results.at(-1)?.data).toMatchObject({
            result: { status: "not-logged-in" },
          });
          expect(revoked).toHaveLength(1);
        }),
      );
    });
  }
});
