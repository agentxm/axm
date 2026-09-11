import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import * as TestClock from "effect/testing/TestClock";
import { defineSpecification } from "@agentxm/specification-metadata";

import { CredentialStore } from "./credential-store.js";
import { initiateDeviceLogin, resumeDeviceLogin } from "./device-login.js";
import { DeviceAuthorizationPending } from "./errors.js";
import { PendingDeviceLoginStore } from "./pending-device-login-store.js";
import {
  authRegistry,
  machineOutputPresenter,
  makeAuthPorts,
} from "./spec-support/test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/login/wait-timeout-preserves-authorization",
  title: "A bounded wait leaves sign-in resumable",
  statement:
    "When login --wait reaches the requested timeout before authorization completes, AXM shall report pending human approval with resume instructions and preserve the pending authorization and existing credentials.",
  class: "functional",
  role: "experience",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["packages/supporting/registry-auth/src/device-login.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Bounded approval wait", () => {
  it.effect("retains the same authorization after a caller-selected timeout", () => {
    const { layer } = makeAuthPorts({
      presenter: machineOutputPresenter,
      auth: { pollDeviceToken: () => Effect.never },
    });
    return Effect.gen(function* () {
      yield* initiateDeviceLogin(authRegistry, {
        openBrowser: false,
        scopes: ["extensions:read"],
      });
      const pendingStore = yield* PendingDeviceLoginStore;
      const before = yield* pendingStore.load();

      const waiting = yield* resumeDeviceLogin(authRegistry, { timeoutSeconds: 5 }).pipe(
        Effect.flip,
        Effect.forkChild,
      );
      yield* TestClock.adjust("5 seconds");
      const failure = yield* Fiber.join(waiting);

      expect(failure).toBeInstanceOf(DeviceAuthorizationPending);
      expect(failure).toMatchObject({
        timeoutSeconds: 5,
        registryUrl: authRegistry,
        intervalSeconds: 1,
        verificationUri: "https://identity.example.test/device",
        verificationUriComplete: "https://identity.example.test/device?user_code=ABCD-1234",
        userCode: "ABCD-1234",
        expiresAt: "1970-01-01T00:01:00.000Z",
        resume: "axm login --wait --json",
      });
      expect(yield* pendingStore.load()).toEqual(before);
      expect(Option.isNone(yield* (yield* CredentialStore).load(authRegistry))).toBe(true);
    }).pipe(Effect.provide(layer));
  });
});
