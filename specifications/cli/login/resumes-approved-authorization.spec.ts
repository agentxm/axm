import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { afterEach, beforeEach, vi } from "vitest";
beforeEach(() => {
  vi.stubEnv("AXM_TOKEN", "");
  vi.stubEnv("AXM_TOKEN_FILE", "");
});
afterEach(() => vi.unstubAllEnvs());
import * as Option from "effect/Option";
import { CredentialStore, PendingDeviceLoginStore } from "axm.sh/specification-harness";
import { handleLogin } from "axm.sh/specification-harness";
import {
  authRegistry,
  loginOptions,
  makeAuthSpecContext,
  resumeLoginOptions,
} from "../../support/auth-harness.js";
import { handleToken } from "axm.sh/specification-harness";

export const specification = defineSpecification({
  requirement: "cli/login/resumes-approved-authorization",
  title: "Approved device sign-in establishes the selected Registry session",
  statement:
    "When a pending device authorization is approved, login --wait shall save the issued credentials for its Registry, clear the pending authorization, and make that session available to subsequent commands.",
  class: "functional",
  role: "experience",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["packages/cli/src/root/auth/login.internal.test.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Approved authorization", () => {
  it.effect("uses the saved device code and exposes the new session afterward", () => {
    const context = makeAuthSpecContext();
    return context.provide(
      Effect.gen(function* () {
        yield* handleLogin(loginOptions);
        yield* handleLogin(resumeLoginOptions);
        const stored = yield* (yield* CredentialStore).load(authRegistry);
        expect(Option.getOrThrow(stored)).toMatchObject({
          handle: "@alice",
          access_token: "fixture-new-access",
          refresh_token: "fixture-new-refresh",
        });
        expect(Option.isNone(yield* (yield* PendingDeviceLoginStore).load())).toBe(true);
        expect(context.polledCodes).toEqual(["fixture-device-secret-1"]);
        yield* handleToken();
        expect(context.rendererState.results.at(-1)?.data).toEqual({
          data: { token: "fixture-new-access" },
        });
      }),
    );
  });
});
