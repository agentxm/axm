import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as Option from "effect/Option";
import { afterEach, vi } from "vitest";
import {
  CredentialStore,
  PendingDeviceLoginStore,
  getAppError,
  handleLogin,
  handleToken,
} from "axm.sh/specification-harness";
import {
  authCredentialFile,
  authRegistry,
  loginOptions,
  makeAuthSpecContext,
} from "../support/auth-harness.js";
afterEach(() => vi.unstubAllEnvs());

export const specification = defineSpecification({
  requirement: "cli/disabled-credential-persistence-requires-explicit-token",
  title: "Environments without session storage require explicit tokens",
  statement:
    "When persisted credentials are disabled, AXM shall refuse login and saved-session authentication with explicit-token guidance while allowing commands to use an explicitly supplied environment token.",
  class: "functional",
  role: "experience",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["packages/registry-auth/src/credential-store.internal.test.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Disabled credential persistence", () => {
  it.effect("requires explicit credentials and does not start a persistent sign-in", () => {
    vi.stubEnv("AXM_TOKEN", "");
    vi.stubEnv("AXM_TOKEN_FILE", "");
    const context = makeAuthSpecContext({
      credentials: authCredentialFile,
      allowsPersistedCredentials: false,
    });
    return context.provide(
      Effect.gen(function* () {
        const store = yield* CredentialStore;
        const before = yield* store.load(authRegistry);
        for (const operation of [handleLogin(loginOptions), handleToken()]) {
          const error = getAppError(yield* operation.pipe(Effect.flip));
          expect(error.code).toBe("auth_required");
          expect(JSON.stringify(error)).toContain("AXM_TOKEN_FILE");
        }
        expect(context.requestedScopes).toEqual([]);
        expect(Option.isNone(yield* (yield* PendingDeviceLoginStore).load())).toBe(true);
        expect(yield* store.load(authRegistry)).toEqual(before);
        vi.stubEnv("AXM_TOKEN", "fixture-explicit-token");
        yield* handleToken();
        expect(context.rendererState.results.at(-1)?.data).toEqual({
          data: { token: "fixture-explicit-token" },
        });
      }),
    );
  });
});
