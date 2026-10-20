import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Deferred from "effect/Deferred";
import * as Fiber from "effect/Fiber";
import * as TestClock from "effect/testing/TestClock";
import * as Layer from "effect/Layer";
import { defineSpecification } from "@agentxm/specification-metadata";
import { runDeviceLogin, DeviceLoginInteractionTest } from "./device-login.js";
import { runLoopbackLogin } from "../adapters/loopback-login.js";
import { AuthClientTest, type AuthClientService } from "./auth-client.js";
import { CredentialStore } from "../credentials/credential-store.js";
import { DeviceLoginCodeExpired } from "./errors.js";
import { login } from "./login.js";
import {
  authEndpoint,
  authKey,
  authSelectedRegistry,
  deviceLoginRequest,
  makeAuthPorts,
} from "./test-support/test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/login/replaces-an-expired-attached-sign-in-once",
  title: "An attached sign-in replaces one expired authorization transaction",
  statement:
    "While a person remains attached to browser or device-code sign-in, AXM shall replace the first expired transaction once with fresh authorization material and announce the replacement, allow fifteen minutes for each browser transaction, stop on the second expiry without changing credentials, and never replace an expired transaction in machine-output or unattended sign-in.",
  class: "functional",
  role: "experience",
  goals: ["extension-adoption", "actionable-diagnostics"],
  boundary: "platform",
  boundaryRationale:
    "Loopback examples acquire and release native HTTP listeners; device examples substitute the Registry and storage ports.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
  limitations: [
    {
      limitation:
        "The test clock advances real listener waits; these examples do not open an external browser or wait fifteen real minutes.",
      retirementCondition: "Combine with released browser sign-in verification.",
    },
  ],
});

describe("One replacement while attached", () => {
  it.effect("replaces an expired device code once and completes the replacement", () => {
    const polled: string[] = [];
    const ports = makeAuthPorts({
      auth: {
        pollDeviceToken: (_endpoint, code) =>
          Effect.suspend(() => {
            polled.push(code);
            return polled.length === 1
              ? Effect.fail(new DeviceLoginCodeExpired())
              : Effect.succeed({
                  access_token: "replacement-access",
                  refresh_token: "replacement-refresh",
                  expires_at: DateTime.makeUnsafe("2099-01-01T00:00:00Z"),
                });
          }),
      },
    });
    return Effect.gen(function* () {
      const result = yield* runDeviceLogin(authEndpoint);
      expect(result.status).toBe("logged-in");
      expect(ports.deviceAuthorizations).toEqual([
        "fixture-device-secret-1",
        "fixture-device-secret-2",
      ]);
      expect(polled).toEqual(ports.deviceAuthorizations);
      expect(ports.presenterState.deviceCodeReplacements).toEqual([true]);
      expect(ports.deviceInteractionState.openBrowserCalls).toHaveLength(2);
      expect(ports.presenterState.handoffs).toHaveLength(2);
    }).pipe(Effect.provide(ports.layer));
  });

  it.effect("stops after the replacement code expires without persisting credentials", () => {
    const ports = makeAuthPorts({
      auth: { pollDeviceToken: () => Effect.fail(new DeviceLoginCodeExpired()) },
    });
    return Effect.gen(function* () {
      const failure = yield* Effect.flip(runDeviceLogin(authEndpoint));
      expect(failure).toMatchObject({
        category: "auth_expired",
        detail: "That code expired. Run axm login to get a new one.",
      });
      expect(ports.deviceAuthorizations).toHaveLength(2);
      expect(ports.presenterState.deviceCodeReplacements).toEqual([true]);
      expect((yield* (yield* CredentialStore).load(authKey))._tag).toBe("None");
    }).pipe(Effect.provide(ports.layer));
  });

  it.effect.each([
    { machineOutput: true, unattended: false },
    { machineOutput: false, unattended: true },
  ])("does not replace an expired unattended transaction: %j", (mode) => {
    const ports = makeAuthPorts({
      auth: { pollDeviceToken: () => Effect.fail(new DeviceLoginCodeExpired()) },
    });
    return Effect.gen(function* () {
      const failure = yield* Effect.flip(
        login(deviceLoginRequest({ ...mode, waitForHumanSeconds: 120 }), authSelectedRegistry),
      );
      expect(failure).toMatchObject({ category: "auth_expired" });
      expect(ports.deviceAuthorizations).toHaveLength(1);
      expect(ports.presenterState.deviceCodeReplacements).toEqual([]);
      expect(ports.deviceInteractionState.openBrowserCalls).toEqual([]);
    }).pipe(Effect.provide(ports.layer));
  });

  it.effect("uses fresh PKCE and state for exactly two fifteen-minute browser transactions", () =>
    Effect.gen(function* () {
      const attempts: Array<Parameters<AuthClientService["buildAuthorizeUrl"]>[1]> = [];
      const firstOpened = yield* Deferred.make<void>();
      const secondOpened = yield* Deferred.make<void>();
      const ports = makeAuthPorts();
      const interaction = DeviceLoginInteractionTest({
        openBrowser: () =>
          Deferred.succeed(attempts.length === 1 ? firstOpened : secondOpened, undefined).pipe(
            Effect.as(true),
          ),
      });
      const auth = AuthClientTest({
        buildAuthorizeUrl: (_endpoint, input) => {
          attempts.push(input);
          return `https://identity.example.test/oauth/authorize?state=${input.state}`;
        },
      });
      const layer = Layer.mergeAll(ports.layer, auth, interaction.layer);
      const startedAt = yield* DateTime.now;
      const waiting = yield* runLoopbackLogin(authEndpoint).pipe(
        Effect.flip,
        Effect.provide(layer),
        Effect.forkChild,
      );
      yield* Deferred.await(firstOpened);
      yield* TestClock.adjust("15 minutes");
      yield* Deferred.await(secondOpened);
      yield* TestClock.adjust("15 minutes");
      const failure = yield* Fiber.join(waiting);
      expect(failure).toMatchObject({ _tag: "LoopbackLoginFallback", reason: "timeout" });
      expect(attempts).toHaveLength(2);
      expect(new Set(attempts.map(({ challenge }) => challenge)).size).toBe(2);
      expect(new Set(attempts.map(({ state }) => state)).size).toBe(2);
      expect(
        attempts.map(
          ({ expiresAt }) => DateTime.toEpochMillis(expiresAt) - DateTime.toEpochMillis(startedAt),
        ),
      ).toEqual([900_000, 1_800_000]);
      expect(ports.presenterState.browserSignInRestarts).toEqual([true]);
      expect(interaction.state.openBrowserCalls).toHaveLength(2);
      const stored = yield* Effect.gen(function* () {
        return yield* (yield* CredentialStore).load(authKey);
      }).pipe(Effect.provide(layer));
      expect(stored._tag).toBe("None");
    }),
  );
});
