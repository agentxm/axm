import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as Option from "effect/Option";
import {
  CredentialStore,
  PendingDeviceLoginStore,
  RegistryUrl,
  getAppError,
  handleLogin,
} from "axm.sh/specification-harness";
import {
  authRegistry,
  otherAuthRegistry,
  loginOptions,
  resumeLoginOptions,
  makeAuthSpecContext,
} from "../../support/auth-harness.js";

export const specification = defineSpecification({
  requirement: "cli/login/resume-requires-matching-pending-authorization",
  title: "Sign-in resumes only its Registry authorization",
  statement:
    "When login --wait has no pending authorization for the selected Registry, AXM shall report the missing or mismatched authorization without changing saved credentials or another Registry authorization.",
  class: "functional",
  role: "experience",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["packages/cli/src/root/auth/login.internal.test.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Resume eligibility", () => {
  it.effect("refuses an absent or other-Registry authorization", () => {
    const context = makeAuthSpecContext();
    return context.provide(
      Effect.gen(function* () {
        const missing = yield* handleLogin(resumeLoginOptions).pipe(Effect.flip);
        expect(getAppError(missing).code).toBe("not_found");
        yield* handleLogin(loginOptions);
        const pending = yield* PendingDeviceLoginStore;
        const before = yield* pending.load();
        const wrongRegistry = yield* handleLogin(resumeLoginOptions).pipe(
          Effect.provideService(RegistryUrl, otherAuthRegistry),
          Effect.flip,
        );
        expect(getAppError(wrongRegistry).code).toBe("conflict");
        expect(yield* pending.load()).toEqual(before);
        expect(Option.isNone(yield* (yield* CredentialStore).load(authRegistry))).toBe(true);
        expect(context.polledCodes).toEqual([]);
      }),
    );
  });
});
