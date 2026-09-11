import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as TestClock from "effect/testing/TestClock";
import { defineSpecification } from "@agentxm/specification-metadata";

import { CredentialStore } from "./credential-store.js";
import { initiateDeviceLogin, resumeDeviceLogin } from "./device-login.js";
import { DeviceLoginCodeExpired, DeviceLoginDenied } from "./errors.js";
import { PendingDeviceLoginStore } from "./pending-device-login-store.js";
import {
  authCredentialFile,
  authExpiry,
  authFailureCategory,
  authHandle,
  authRegistry,
  machineOutputPresenter,
  makeAuthPorts,
  otherAuthRegistry,
} from "./spec-support/test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/login/terminal-authorization-failures-preserve-credentials",
  title: "Denied and expired sign-ins leave saved sessions unchanged",
  statement:
    "When a pending device authorization is denied or expires, login --wait shall report the corresponding failure, remove that pending authorization, and leave saved credentials unchanged.",
  class: "functional",
  role: "experience",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["packages/supporting/registry-auth/src/device-login.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Terminal authorization failure", () => {
  for (const outcome of ["denied", "expired-at-registry", "expired-locally"] as const) {
    it.effect(outcome, () => {
      const { layer } = makeAuthPorts({
        credentials: authCredentialFile,
        presenter: machineOutputPresenter,
        auth: {
          pollDeviceToken: () =>
            Effect.fail(
              outcome === "denied" ? new DeviceLoginDenied() : new DeviceLoginCodeExpired(),
            ),
        },
      });
      return Effect.gen(function* () {
        const credentials = yield* CredentialStore;
        // Start with no selected session so sign-in may initiate; keep the
        // other Registry as the preservation witness.
        yield* credentials.clear(authRegistry);
        yield* initiateDeviceLogin(authRegistry, {
          openBrowser: false,
          scopes: ["extensions:read"],
        });
        yield* credentials.save(authRegistry, authHandle, {
          access_token: "existing-access",
          refresh_token: "existing-refresh",
          expires_at: authExpiry,
        });
        const before = yield* credentials.load(authRegistry);
        const otherBefore = yield* credentials.load(otherAuthRegistry);

        if (outcome === "expired-locally") yield* TestClock.adjust("61 seconds");
        const error = yield* resumeDeviceLogin(authRegistry).pipe(Effect.flip);

        expect(authFailureCategory(error)).toBe(
          outcome === "denied" ? "auth_denied" : "auth_expired",
        );
        expect(Option.isNone(yield* (yield* PendingDeviceLoginStore).load())).toBe(true);
        expect(yield* credentials.load(authRegistry)).toEqual(before);
        expect(yield* credentials.load(otherAuthRegistry)).toEqual(otherBefore);
      }).pipe(Effect.provide(layer));
    });
  }
});
