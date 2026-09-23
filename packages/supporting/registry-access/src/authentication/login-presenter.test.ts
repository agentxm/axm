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
  authCredentialFile,
  authRegistry,
  deviceLoginRequest,
  machineOutputPresenter,
  makeAuthPorts,
} from "./test-support/test-helpers.js";

const outputFailed = new RegistryAccessFailed({
  category: "internal",
  detail: "The authentication output could not be delivered.",
});

describe("Authentication presentation failures", () => {
  it.effect("does not continue to human side effects when pending-document delivery fails", () => {
    const ports = makeAuthPorts({
      presenter: { tryEmitPendingDeviceLogin: () => Effect.fail(outputFailed) },
    });
    return Effect.gen(function* () {
      expect(yield* initiateDeviceLogin(authRegistry).pipe(Effect.flip)).toBe(outputFailed);
      expect(ports.deviceInteractionState.openBrowserCalls).toEqual([]);
      expect(ports.deviceInteractionState.copyToClipboardCalls).toEqual([]);
      expect(ports.polledCodes).toEqual([]);
      expect(ports.presenterState.pendingApprovals).toEqual([]);
      expect(ports.presenterState.loginSuccesses).toEqual([]);
      expect(Option.isSome(yield* (yield* PendingDeviceLoginStore).load())).toBe(true);
      expect(Option.isNone(yield* (yield* CredentialStore).load(authRegistry))).toBe(true);
    }).pipe(Effect.provide(ports.layer));
  });

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
      const before = yield* store.load(authRegistry);
      expect(
        yield* login(
          deviceLoginRequest({ machineOutput: false, nonInteractive: false }),
          authRegistry,
        ).pipe(Effect.flip),
      ).toBe(promptUnavailable);
      expect(yield* store.load(authRegistry)).toEqual(before);
      expect(ports.deviceAuthorizations).toEqual([]);
      expect(ports.presenterState.loginSuccesses).toEqual([]);
    }).pipe(Effect.provide(ports.layer));
  });

  it.effect("keeps pending authorization and credentials when the handoff cannot be shown", () => {
    const ports = makeAuthPorts({
      credentials: authCredentialFile,
      presenter: { ...machineOutputPresenter, awaitHuman: () => Effect.fail(outputFailed) },
    });
    return Effect.gen(function* () {
      yield* initiateDeviceLogin(authRegistry);
      const pending = yield* PendingDeviceLoginStore;
      const store = yield* CredentialStore;
      const beforePending = yield* pending.load();
      const beforeCredentials = yield* store.load(authRegistry);
      expect(yield* resumeDeviceLogin(authRegistry).pipe(Effect.flip)).toBe(outputFailed);
      expect(yield* pending.load()).toEqual(beforePending);
      expect(yield* store.load(authRegistry)).toEqual(beforeCredentials);
      expect(ports.polledCodes).toEqual([]);
      expect(ports.presenterState.loginSuccesses).toEqual([]);
    }).pipe(Effect.provide(ports.layer));
  });

  it.effect("reports failed success delivery without discarding the established session", () => {
    const ports = makeAuthPorts({
      presenter: { ...machineOutputPresenter, emitLoginSuccess: () => Effect.fail(outputFailed) },
    });
    return Effect.gen(function* () {
      yield* initiateDeviceLogin(authRegistry);
      expect(yield* resumeDeviceLogin(authRegistry).pipe(Effect.flip)).toBe(outputFailed);
      const stored = yield* (yield* CredentialStore).load(authRegistry);
      expect(Option.getOrThrow(stored).access_token).toBe("fixture-new-access");
      expect(Option.isNone(yield* (yield* PendingDeviceLoginStore).load())).toBe(true);
      expect(ports.presenterState.loginSuccesses).toEqual([]);
    }).pipe(Effect.provide(ports.layer));
  });

  it.effect("keeps an interrupted handoff interrupted and leaves authorization resumable", () => {
    const ports = makeAuthPorts({
      presenter: { ...machineOutputPresenter, awaitHuman: () => Effect.interrupt },
    });
    return Effect.gen(function* () {
      yield* initiateDeviceLogin(authRegistry);
      const pending = yield* PendingDeviceLoginStore;
      const before = yield* pending.load();
      const exit = yield* resumeDeviceLogin(authRegistry).pipe(Effect.exit);
      expect(Exit.hasInterrupts(exit)).toBe(true);
      expect(yield* pending.load()).toEqual(before);
      expect(Option.isNone(yield* (yield* CredentialStore).load(authRegistry))).toBe(true);
      expect(ports.polledCodes).toEqual([]);
      expect(ports.presenterState.loginSuccesses).toEqual([]);
    }).pipe(Effect.provide(ports.layer));
  });
});
