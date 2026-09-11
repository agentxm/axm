import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { defineSpecification } from "@agentxm/specification-metadata";

import { CredentialStore } from "./credential-store.js";
import { initiateDeviceLogin, resumeDeviceLogin } from "./device-login.js";
import { PendingDeviceLoginStore } from "./pending-device-login-store.js";
import {
  authFailureCategory,
  authRegistry,
  machineOutputPresenter,
  makeAuthPorts,
  otherAuthRegistry,
} from "./spec-support/test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/login/resume-requires-matching-pending-authorization",
  title: "Sign-in resumes only its Registry authorization",
  statement:
    "When login --wait has no pending authorization for the selected Registry, AXM shall report the missing or mismatched authorization without changing saved credentials or another Registry authorization.",
  class: "functional",
  role: "experience",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["packages/supporting/registry-auth/src/device-login.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Resume eligibility", () => {
  it.effect("refuses an absent or other-Registry authorization", () => {
    const ports = makeAuthPorts({ presenter: machineOutputPresenter });
    return Effect.gen(function* () {
      const missing = yield* resumeDeviceLogin(authRegistry).pipe(Effect.flip);
      expect(authFailureCategory(missing)).toBe("not_found");

      yield* initiateDeviceLogin(authRegistry, {
        openBrowser: false,
        scopes: ["extensions:read"],
      });
      const pending = yield* PendingDeviceLoginStore;
      const before = yield* pending.load();

      const wrongRegistry = yield* resumeDeviceLogin(otherAuthRegistry).pipe(Effect.flip);
      expect(authFailureCategory(wrongRegistry)).toBe("conflict");

      expect(yield* pending.load()).toEqual(before);
      expect(Option.isNone(yield* (yield* CredentialStore).load(authRegistry))).toBe(true);
      expect(ports.polledCodes).toEqual([]);
    }).pipe(Effect.provide(ports.layer));
  });
});
