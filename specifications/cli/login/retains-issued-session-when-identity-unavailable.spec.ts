import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as Option from "effect/Option";
import { afterEach, beforeEach, vi } from "vitest";
import {
  CredentialStore,
  RegistryAuthFailed,
  handleLogin,
  handleWhoami,
} from "axm.sh/specification-harness";
import {
  authExpiry,
  authHandle,
  authRegistry,
  loginOptions,
  resumeLoginOptions,
  makeAuthSpecContext,
} from "../../support/auth-harness.js";
beforeEach(() => {
  vi.stubEnv("AXM_TOKEN", "");
  vi.stubEnv("AXM_TOKEN_FILE", "");
});
afterEach(() => vi.unstubAllEnvs());

export const specification = defineSpecification({
  requirement: "cli/login/retains-issued-session-when-identity-unavailable",
  title: "Sign-in retains an issued session when identity lookup is unavailable",
  statement:
    "When device authorization issues a session but identity lookup is temporarily unavailable, AXM shall retain the usable session without presenting an unverified identity, allowing later identity inspection to report the canonical Registry account.",
  class: "functional",
  role: "experience",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["packages/registry-auth/src/device-login.internal.test.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Identity lookup recovery", () => {
  it.effect("retains the issued session and reports only the later verified account", () => {
    let identityAvailable = false;
    const context = makeAuthSpecContext({
      auth: {
        getMe: (token) =>
          Effect.suspend(() => {
            expect(token).toBe("fixture-new-access");
            return identityAvailable
              ? Effect.succeed({
                  userHandle: authHandle,
                  tokenType: "session",
                  scopes: ["extensions:read"],
                  resourceRestrictions: { extensions: null },
                  expiresAt: authExpiry,
                })
              : Effect.fail(
                  new RegistryAuthFailed({
                    category: "internal",
                    detail: "Fixture identity temporarily unavailable",
                  }),
                );
          }),
      },
    });
    return context.provide(
      Effect.gen(function* () {
        yield* handleLogin(loginOptions);
        yield* handleLogin(resumeLoginOptions);
        const credentials = Option.getOrThrow(yield* (yield* CredentialStore).load(authRegistry));
        expect(credentials.access_token).toBe("fixture-new-access");
        expect(context.rendererState.results.at(-1)?.data).toEqual({
          result: { status: "logged-in", registryHost: "registry.example.test" },
        });
        identityAvailable = true;
        yield* handleWhoami();
        expect(context.rendererState.results.at(-1)?.data).toMatchObject({
          data: { user: "@alice", registry: authRegistry, scopes: ["extensions:read"] },
        });
        for (const privateValue of ["@unknown", "fixture-new-access", "fixture-new-refresh"]) {
          expect(JSON.stringify(context.rendererState.results)).not.toContain(privateValue);
        }
      }),
    );
  });
});
