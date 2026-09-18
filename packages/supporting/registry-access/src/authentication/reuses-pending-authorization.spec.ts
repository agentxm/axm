import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { defineSpecification } from "@agentxm/specification-metadata";

import { initiateDeviceLogin } from "./device-login.js";
import { PendingDeviceLoginStore } from "./pending-device-login-store.js";
import {
  authFailureCategory,
  authRegistry,
  machineOutputPresenter,
  makeAuthPorts,
  otherAuthRegistry,
} from "./test-support/test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/login/reuses-pending-authorization",
  title: "Repeated sign-in preserves pending authorization",
  statement:
    "When a device authorization is unexpired, AXM shall reuse it for the same Registry, refuse a request for a different Registry without changing it, and replace it only when restart is explicitly requested.",
  class: "functional",
  role: "experience",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["packages/supporting/registry-access/src/authentication/device-login.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Pending authorization reuse", () => {
  it.effect("reuses the pending sign-in and requires explicit replacement", () => {
    const ports = makeAuthPorts({ presenter: machineOutputPresenter });
    const start = (restart = false) =>
      initiateDeviceLogin(authRegistry, { openBrowser: false, restart });

    return Effect.gen(function* () {
      yield* start();
      const store = yield* PendingDeviceLoginStore;
      const original = yield* store.load();

      // Every sign-in asks for the same thing, so a repeated request for the
      // same Registry is always the same request.
      const reused = yield* start();
      expect(yield* store.load()).toEqual(original);
      expect(ports.deviceAuthorizations).toHaveLength(1);
      expect(reused.flow).toBe("re-emitted");

      const changedRegistry = yield* initiateDeviceLogin(otherAuthRegistry, {
        openBrowser: false,
      }).pipe(Effect.flip);
      expect(authFailureCategory(changedRegistry)).toBe("conflict");
      expect(yield* store.load()).toEqual(original);

      yield* start(true);
      const replacement = yield* store.load();
      expect(Option.isSome(replacement)).toBe(true);
      expect(replacement).not.toEqual(original);
      expect(ports.deviceAuthorizations).toHaveLength(2);
    }).pipe(Effect.provide(ports.layer));
  });
});
