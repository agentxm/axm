import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { defineSpecification } from "@agentxm/specification-metadata";

import { CredentialStore } from "../credentials/credential-store.js";
import { initiateDeviceLogin, resumeDeviceLogin } from "./device-login.js";
import { login } from "./login.js";
import { PendingDeviceLoginStore } from "./pending-device-login-store.js";
import {
  authFailureCategory,
  authRegistry,
  machineOutputPresenter,
  makeAuthPorts,
  otherAuthRegistry,
  resumeLoginRequest,
} from "./test-support/test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/login/resume-requires-matching-pending-authorization",
  title: "Sign-in resumes only its Registry authorization",
  statement:
    "When a device sign-in wait finds a pending authorization that belongs to another Registry, AXM shall report the mismatch without polling, replacing that authorization, or changing saved credentials.",
  class: "functional",
  role: "experience",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["packages/supporting/registry-access/src/authentication/device-login.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Resume eligibility", () => {
  it.effect("refuses another Registry's pending authorization", () => {
    const ports = makeAuthPorts({ presenter: machineOutputPresenter });
    return Effect.gen(function* () {
      yield* initiateDeviceLogin(authRegistry, {
        openBrowser: false,
      });
      const pending = yield* PendingDeviceLoginStore;
      const before = yield* pending.load();

      const waited = yield* login(resumeLoginRequest(), otherAuthRegistry).pipe(Effect.flip);
      expect(authFailureCategory(waited)).toBe("conflict");
      const resumed = yield* resumeDeviceLogin(otherAuthRegistry).pipe(Effect.flip);
      expect(authFailureCategory(resumed)).toBe("conflict");

      expect(yield* pending.load()).toEqual(before);
      expect(ports.deviceAuthorizations).toHaveLength(1);
      expect(Option.isNone(yield* (yield* CredentialStore).load(authRegistry))).toBe(true);
      expect(Option.isNone(yield* (yield* CredentialStore).load(otherAuthRegistry))).toBe(true);
      expect(ports.polledCodes).toEqual([]);
    }).pipe(Effect.provide(ports.layer));
  });
});
