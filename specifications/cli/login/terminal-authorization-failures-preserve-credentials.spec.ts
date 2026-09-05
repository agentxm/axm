import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as Option from "effect/Option";
import { CredentialStore, PendingDeviceLoginStore } from "axm.sh/specification-harness";
import { handleLogin } from "axm.sh/specification-harness";
import {
  authRegistry,
  loginOptions,
  makeAuthSpecContext,
  resumeLoginOptions,
} from "../../support/auth-harness.js";
import * as TestClock from "effect/testing/TestClock";
import { DeviceLoginCodeExpired, DeviceLoginDenied } from "axm.sh/specification-harness";
import { getAppError } from "axm.sh/specification-harness";
import {
  authCredentialFile,
  authExpiry,
  authHandle,
  otherAuthRegistry,
} from "../../support/auth-harness.js";

export const specification = defineSpecification({
  requirement: "cli/login/terminal-authorization-failures-preserve-credentials",
  title: "Denied and expired sign-ins leave saved sessions unchanged",
  statement:
    "When a pending device authorization is denied or expires, login --wait shall report the corresponding failure, remove that pending authorization, and leave saved credentials unchanged.",
  class: "functional",
  role: "experience",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["packages/cli/src/root/auth/login.internal.test.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Terminal authorization failure", () => {
  for (const outcome of ["denied", "expired-at-registry", "expired-locally"] as const) {
    it.effect(outcome, () => {
      const context = makeAuthSpecContext({
        credentials: authCredentialFile,
        auth: {
          pollDeviceToken: () =>
            Effect.fail(
              outcome === "denied" ? new DeviceLoginDenied() : new DeviceLoginCodeExpired(),
            ),
        },
      });
      return context.provide(
        Effect.gen(function* () {
          const credentials = yield* CredentialStore;
          // Start with no selected session so login may initiate; keep the other Registry as a preservation witness.
          yield* credentials.clear(authRegistry);
          yield* handleLogin(loginOptions);
          yield* credentials.save(authRegistry, authHandle, {
            access_token: "existing-access",
            refresh_token: "existing-refresh",
            expires_at: authExpiry,
          });
          const before = yield* credentials.load(authRegistry);
          const otherBefore = yield* credentials.load(otherAuthRegistry);
          if (outcome === "expired-locally") yield* TestClock.adjust("61 seconds");
          const error = yield* handleLogin(resumeLoginOptions).pipe(Effect.flip);
          expect(getAppError(error).code).toBe(
            outcome === "denied" ? "auth_denied" : "auth_expired",
          );
          expect(Option.isNone(yield* (yield* PendingDeviceLoginStore).load())).toBe(true);
          expect(yield* credentials.load(authRegistry)).toEqual(before);
          expect(yield* credentials.load(otherAuthRegistry)).toEqual(otherBefore);
        }),
      );
    });
  }
});
