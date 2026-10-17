import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import * as TestClock from "effect/testing/TestClock";
import { defineSpecification } from "@agentxm/specification-metadata";

import { CredentialStore } from "../credentials/credential-store.js";
import { login } from "./login.js";
import { PendingDeviceLoginStore } from "./pending-device-login-store.js";
import {
  authEmail,
  authRegistryHost,
  deviceLoginRequest,
  makeAuthPorts,
  resumeLoginRequest,
  authSelectedRegistry,
  authKey,
} from "./test-support/test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/login/device-sign-in-waits-in-one-invocation",
  title: "Device sign-in can start and finish in one bounded invocation",
  statement:
    "Human-text device sign-in shall wait for approval even without prompt permission; when sign-in requests a wait of N seconds, AXM shall use device-code sign-in whether or not it was named, start or reuse the selected Registry's device authorization, wait no longer than N seconds or the code's remaining lifetime, save approved credentials before reporting one final result, leave a still-valid authorization resumable when the bound elapses, and shall not open a browser or copy the code in unattended mode.",
  class: "functional",
  role: "experience",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "packages/supporting/registry-access/src/authentication/login.ts",
    "packages/supporting/registry-access/src/authentication/device-login.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Single-invocation device sign-in", () => {
  it.effect("explicit human device sign-in waits even without prompt permission", () => {
    const ports = makeAuthPorts();
    return Effect.gen(function* () {
      yield* login(
        deviceLoginRequest({ unattended: false, canAsk: false, machineOutput: false }),
        authSelectedRegistry,
      );
      expect(ports.polledCodes).toEqual(["fixture-device-secret-1"]);
      expect(ports.deviceInteractionState.openBrowserCalls).toEqual([]);
      expect(Option.isSome(yield* (yield* CredentialStore).load(authKey))).toBe(true);
    }).pipe(Effect.provide(ports.layer));
  });

  it.effect("starts, waits, and saves credentials without an intermediate result", () => {
    const ports = makeAuthPorts();
    return Effect.gen(function* () {
      const outcome = yield* login(resumeLoginRequest(), authSelectedRegistry);

      expect(ports.deviceAuthorizations).toEqual(["fixture-device-secret-1"]);
      expect(ports.polledCodes).toEqual(["fixture-device-secret-1"]);
      expect(outcome).toEqual({
        _tag: "SignedIn",
        result: {
          status: "logged-in",
          registryHost: authRegistryHost,
          handle: "@alice",
          email: authEmail,
        },
      });
      expect(Option.isSome(yield* (yield* CredentialStore).load(authKey))).toBe(true);
      expect(ports.deviceInteractionState.openBrowserCalls).toEqual([]);
      expect(ports.deviceInteractionState.copyToClipboardCalls).toEqual([]);
    }).pipe(Effect.provide(ports.layer));
  });

  it.effect("a bounded wait selects device-code sign-in without naming it", () => {
    const ports = makeAuthPorts();
    return Effect.gen(function* () {
      yield* login(resumeLoginRequest({ deviceCode: false }), authSelectedRegistry);

      expect(ports.deviceAuthorizations).toEqual(["fixture-device-secret-1"]);
      expect(Option.isSome(yield* (yield* CredentialStore).load(authKey))).toBe(true);
      expect(ports.deviceInteractionState.openBrowserCalls).toEqual([]);
    }).pipe(Effect.provide(ports.layer));
  });

  it.effect("reuses the pending authorization an earlier invocation started", () => {
    const ports = makeAuthPorts();
    return Effect.gen(function* () {
      yield* login(deviceLoginRequest(), authSelectedRegistry);
      yield* login(resumeLoginRequest(), authSelectedRegistry);

      expect(ports.deviceAuthorizations).toEqual(["fixture-device-secret-1"]);
      expect(ports.polledCodes).toEqual(["fixture-device-secret-1"]);
    }).pipe(Effect.provide(ports.layer));
  });

  it.effect("an elapsed bound leaves the authorization resumable", () => {
    const ports = makeAuthPorts({
      auth: { pollDeviceToken: () => Effect.never },
    });
    return Effect.gen(function* () {
      const waiting = yield* login(
        resumeLoginRequest({ waitForHumanSeconds: 5 }),
        authSelectedRegistry,
      ).pipe(Effect.flip, Effect.forkChild);
      yield* TestClock.adjust("6 seconds");
      const error = yield* Fiber.join(waiting);

      expect(error._tag).toBe("DeviceAuthorizationPending");
      expect(Option.isSome(yield* (yield* PendingDeviceLoginStore).load())).toBe(true);
      expect(Option.isNone(yield* (yield* CredentialStore).load(authKey))).toBe(true);
    }).pipe(Effect.provide(ports.layer));
  });
});
