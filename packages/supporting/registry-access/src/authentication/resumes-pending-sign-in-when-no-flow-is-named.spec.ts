import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { defineSpecification } from "@agentxm/specification-metadata";

import { CredentialStore } from "../credentials/credential-store.js";
import { AuthInteractionAbandoned } from "./errors.js";
import { login } from "./login.js";
import type { HumanHandoff } from "./login-presenter.js";
import { PendingDeviceLoginStore } from "./pending-device-login-store.js";
import { authRegistry, deviceLoginRequest, makeAuthPorts } from "./test-support/test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/login/resumes-pending-sign-in-when-no-flow-is-named",
  title: "Signing in again picks up a sign-in that is still pending",
  statement:
    "When sign-in names no flow and an unexpired device authorization is pending for the selected Registry, AXM shall wait on that authorization instead of starting a new sign-in, without saying it fell back to device-code sign-in.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "packages/supporting/registry-access/src/authentication/login.ts",
    "packages/supporting/registry-access/src/authentication/device-login.ts",
  ],
  supersedes: [],
  assumptions: [
    "A display is set, so without a pending authorization the same environment would choose browser sign-in.",
  ],
  openQuestions: [],
});

/** An attended sign-in that names no flow, in an environment that can open a browser. */
const plainLogin = deviceLoginRequest({
  deviceCode: false,
  nonInteractive: false,
  machineOutput: false,
});

describe("Signing in again with a pending sign-in", () => {
  it.effect("a stopped wait keeps its code, and the next plain sign-in finishes it", () => {
    let waits = 0;
    const ports = makeAuthPorts({
      environment: { DISPLAY: ":0" },
      presenter: {
        // The person stops the first wait and approves during the second.
        awaitHuman: <A, E, R>(_handoff: HumanHandoff, awaited: Effect.Effect<A, E, R>) => {
          waits += 1;
          return waits === 1
            ? Effect.fail(new AuthInteractionAbandoned({ message: "Stopped waiting." }))
            : awaited;
        },
      },
    });

    return Effect.gen(function* () {
      const stopped = yield* Effect.flip(login({ ...plainLogin, deviceCode: true }, authRegistry));
      expect(stopped).toMatchObject({
        _tag: "DeviceAuthorizationPending",
        waitEnded: { _tag: "Stopped" },
      });
      const pendingStore = yield* PendingDeviceLoginStore;
      const kept = yield* pendingStore.load();
      expect(Option.isSome(kept)).toBe(true);

      yield* login(plainLogin, authRegistry);

      // The second sign-in waited on the first one's code; it started none.
      expect(ports.deviceAuthorizations).toEqual(["fixture-device-secret-1"]);
      expect(ports.polledCodes).toEqual(["fixture-device-secret-1"]);
      expect(ports.presenterState.handoffs).toHaveLength(2);
      expect(ports.presenterState.deviceCodeFallbacks).toEqual([]);
      expect(ports.presenterState.loopbackStarts).toEqual([]);
      expect(ports.presenterState.loginSuccesses).toHaveLength(1);
      expect(Option.isNone(yield* pendingStore.load())).toBe(true);
      expect(Option.isSome(yield* (yield* CredentialStore).load(authRegistry))).toBe(true);
    }).pipe(Effect.provide(ports.layer));
  });
});
