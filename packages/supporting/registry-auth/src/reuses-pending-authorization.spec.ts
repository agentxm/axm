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
} from "./spec-support/test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/login/reuses-pending-authorization",
  title: "Repeated sign-in preserves pending authorization",
  statement:
    "When a device authorization is unexpired, AXM shall reuse it for the same Registry and equivalent requested scopes, refuse a conflicting request without changing it, and replace it only when restart is explicitly requested.",
  class: "functional",
  role: "experience",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["packages/supporting/registry-auth/src/device-login.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Pending authorization reuse", () => {
  it.effect("reuses equivalent scopes and requires explicit replacement for conflicts", () => {
    const ports = makeAuthPorts({ presenter: machineOutputPresenter });
    const start = (scopes: ReadonlyArray<string>, restart = false) =>
      initiateDeviceLogin(authRegistry, { openBrowser: false, restart, scopes });

    return Effect.gen(function* () {
      yield* start(["account:read", "extensions:read"]);
      const store = yield* PendingDeviceLoginStore;
      const original = yield* store.load();

      const reused = yield* start(["extensions:read", "account:read", "extensions:read"]);
      expect(yield* store.load()).toEqual(original);
      expect(ports.requestedScopes).toHaveLength(1);
      expect(reused.flow).toBe("re-emitted");

      const changedScopes = yield* start(["extensions:read"]).pipe(Effect.flip);
      expect(authFailureCategory(changedScopes)).toBe("conflict");
      const changedRegistry = yield* initiateDeviceLogin(otherAuthRegistry, {
        openBrowser: false,
        scopes: ["account:read", "extensions:read"],
      }).pipe(Effect.flip);
      expect(authFailureCategory(changedRegistry)).toBe("conflict");
      expect(yield* store.load()).toEqual(original);

      yield* start(["account:read", "extensions:read"], true);
      const replacement = yield* store.load();
      expect(Option.isSome(replacement)).toBe(true);
      expect(replacement).not.toEqual(original);
      expect(ports.requestedScopes).toHaveLength(2);
    }).pipe(Effect.provide(ports.layer));
  });
});
