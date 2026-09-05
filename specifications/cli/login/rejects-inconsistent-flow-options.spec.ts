import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import {
  CredentialStore,
  PendingDeviceLoginStore,
  getAppError,
  handleLogin,
} from "axm.sh/specification-harness";
import {
  authCredentialFile,
  authRegistry,
  loginOptions,
  makeAuthSpecContext,
} from "../../support/auth-harness.js";

export const specification = defineSpecification({
  requirement: "cli/login/rejects-inconsistent-flow-options",
  title: "Sign-in rejects inconsistent flow options",
  statement:
    "When sign-in options combine incompatible start and resume actions or supply a wait timeout without a resume action, AXM shall report usage failure before changing credentials or pending authorization.",
  class: "functional",
  role: "experience",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["packages/cli/src/root/auth/login.internal.test.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Sign-in option validation", () => {
  const invalidOptions = [
    { ...loginOptions, wait: true },
    { ...loginOptions, deviceCode: false, wait: true, restart: true },
    { ...loginOptions, deviceCode: false, restart: true },
    { ...loginOptions, timeoutSeconds: 5 },
  ];
  for (const options of invalidOptions) {
    it.effect(JSON.stringify(options), () => {
      const context = makeAuthSpecContext({ credentials: authCredentialFile });
      return context.provide(
        Effect.gen(function* () {
          const store = yield* CredentialStore;
          const before = yield* store.load(authRegistry);
          const pending = yield* PendingDeviceLoginStore;
          const pendingBefore = yield* pending.load();
          const failure = yield* handleLogin(options).pipe(Effect.flip);
          expect(getAppError(failure).code).toBe("usage");
          expect(yield* store.load(authRegistry)).toEqual(before);
          expect(yield* pending.load()).toEqual(pendingBefore);
          expect(context.requestedScopes).toEqual([]);
          expect(context.polledCodes).toEqual([]);
          expect(context.rendererState.results).toEqual([]);
        }),
      );
    });
  }
});
