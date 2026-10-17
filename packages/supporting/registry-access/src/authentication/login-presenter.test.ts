import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import { CredentialStore } from "../credentials/credential-store.js";
import { initiateDeviceLogin, resumeDeviceLogin } from "./device-login.js";
import { RegistryAccessFailed } from "./errors.js";
import { login } from "./login.js";
import { PendingDeviceLoginStore } from "./pending-device-login-store.js";
import {
  authSelectedRegistry,
  authCredentialFile,
  deviceLoginRequest,
  makeAuthPorts,
  authEndpoint,
  authKey,
} from "./test-support/test-helpers.js";

const outputFailed = new RegistryAccessFailed({
  category: "internal",
  detail: "The authentication output could not be delivered.",
});

describe("Authentication presentation failures", () => {
  it.effect("does not replace a valid session when its confirmation prompt fails", () => {
    const promptUnavailable = new RegistryAccessFailed({
      category: "usage",
      detail: "An interactive confirmation could not be read.",
    });
    const ports = makeAuthPorts({
      credentials: authCredentialFile,
      presenter: { confirmSessionReplacement: () => Effect.fail(promptUnavailable) },
    });
    return Effect.gen(function* () {
      const store = yield* CredentialStore;
      const before = yield* store.load(authKey);
      expect(
        yield* login(
          deviceLoginRequest({ machineOutput: false, unattended: false, canAsk: true }),
          authSelectedRegistry,
        ).pipe(Effect.flip),
      ).toBe(promptUnavailable);
      expect(yield* store.load(authKey)).toEqual(before);
      expect(ports.deviceAuthorizations).toEqual([]);
    }).pipe(Effect.provide(ports.layer));
  });

  it.effect("keeps pending authorization and credentials when the handoff cannot be shown", () => {
    const ports = makeAuthPorts({
      credentials: authCredentialFile,
      presenter: { awaitHuman: () => Effect.fail(outputFailed) },
    });
    return Effect.gen(function* () {
      yield* initiateDeviceLogin(authEndpoint);
      const pending = yield* PendingDeviceLoginStore;
      const store = yield* CredentialStore;
      const beforePending = yield* pending.load();
      const beforeCredentials = yield* store.load(authKey);
      expect(yield* resumeDeviceLogin(authEndpoint).pipe(Effect.flip)).toBe(outputFailed);
      expect(yield* pending.load()).toEqual(beforePending);
      expect(yield* store.load(authKey)).toEqual(beforeCredentials);
      expect(ports.polledCodes).toEqual([]);
    }).pipe(Effect.provide(ports.layer));
  });

  it.effect("keeps an interrupted handoff interrupted and leaves authorization resumable", () => {
    const ports = makeAuthPorts({
      presenter: { awaitHuman: () => Effect.interrupt },
    });
    return Effect.gen(function* () {
      yield* initiateDeviceLogin(authEndpoint);
      const pending = yield* PendingDeviceLoginStore;
      const before = yield* pending.load();
      const exit = yield* resumeDeviceLogin(authEndpoint).pipe(Effect.exit);
      expect(Exit.hasInterrupts(exit)).toBe(true);
      expect(yield* pending.load()).toEqual(before);
      expect(Option.isNone(yield* (yield* CredentialStore).load(authKey))).toBe(true);
      expect(ports.polledCodes).toEqual([]);
    }).pipe(Effect.provide(ports.layer));
  });
});
