import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import * as TestClock from "effect/testing/TestClock";
import { defineSpecification } from "@agentxm/specification-metadata";

import { CredentialStore } from "../credentials/credential-store.js";
import { initiateDeviceLogin, resumeDeviceLogin } from "./device-login.js";
import { DeviceAuthorizationPending } from "./errors.js";
import { PendingDeviceLoginStore } from "./pending-device-login-store.js";
import {
  abandoningPresenter,
  authRegistry,
  machineOutputPresenter,
  makeAuthPorts,
} from "./test-support/test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/login/ended-wait-preserves-authorization",
  title: "A wait that ends without approval leaves sign-in resumable",
  statement:
    "When a device sign-in wait ends before authorization completes — because the requested timeout elapsed or because a person stopped waiting — AXM shall report pending human approval with resume instructions and preserve the pending authorization and existing credentials.",
  class: "functional",
  role: "experience",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["packages/supporting/registry-access/src/authentication/device-login.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

/** Everything the pending outcome carries, however the wait ended. */
const pendingAuthorization = {
  registryUrl: authRegistry,
  intervalSeconds: 1,
  verificationUri: "https://identity.example.test/device",
  verificationUriComplete: "https://identity.example.test/device?user_code=ABCD-1234",
  userCode: "ABCD-1234",
  expiresAt: "1970-01-01T00:01:00.000Z",
  resume: "axm login --device-code --wait-for-human 300 --json",
} as const;

describe("A wait that ends without approval", () => {
  it.effect("retains the same authorization after a caller-selected timeout", () => {
    const { layer } = makeAuthPorts({
      presenter: machineOutputPresenter,
      auth: { pollDeviceToken: () => Effect.never },
    });
    return Effect.gen(function* () {
      yield* initiateDeviceLogin(authRegistry, { openBrowser: false });
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
        waitEnded: { _tag: "Elapsed", seconds: 5 },
        ...pendingAuthorization,
      });
      expect(yield* pendingStore.load()).toEqual(before);
      expect(Option.isNone(yield* (yield* CredentialStore).load(authRegistry))).toBe(true);
    }).pipe(Effect.provide(layer));
  });

  it.effect("retains the same authorization after a person stops waiting", () => {
    const { layer } = makeAuthPorts({
      presenter: abandoningPresenter,
      auth: { pollDeviceToken: () => Effect.never },
    });
    return Effect.gen(function* () {
      yield* initiateDeviceLogin(authRegistry, {
        openBrowser: false,
      });
      const pendingStore = yield* PendingDeviceLoginStore;
      const before = yield* pendingStore.load();

      const failure = yield* Effect.flip(resumeDeviceLogin(authRegistry));

      expect(failure).toBeInstanceOf(DeviceAuthorizationPending);
      expect(failure).toMatchObject({
        waitEnded: { _tag: "Stopped" },
        ...pendingAuthorization,
      });
      expect(yield* pendingStore.load()).toEqual(before);
      expect(Option.isNone(yield* (yield* CredentialStore).load(authRegistry))).toBe(true);
    }).pipe(Effect.provide(layer));
  });
});
