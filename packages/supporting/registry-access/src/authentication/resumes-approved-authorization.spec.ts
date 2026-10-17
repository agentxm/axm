import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { defineSpecification } from "@agentxm/specification-metadata";

import { CredentialStore } from "../credentials/credential-store.js";
import { currentToken } from "./identity.js";
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
  requirement: "cli/login/resumes-approved-authorization",
  title: "Approved device sign-in establishes the selected Registry session",
  statement:
    "When a pending device authorization is approved, a bounded device sign-in wait (login --wait-for-human) shall save the issued credentials for its Registry, clear the pending authorization, and make that session available to subsequent commands.",
  class: "functional",
  role: "experience",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["packages/supporting/registry-access/src/authentication/device-login.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Approved authorization", () => {
  it.effect("uses the saved device code and exposes the new session afterward", () => {
    const ports = makeAuthPorts();
    return Effect.gen(function* () {
      yield* login(deviceLoginRequest(), authSelectedRegistry);
      const outcome = yield* login(resumeLoginRequest(), authSelectedRegistry);

      const stored = yield* (yield* CredentialStore).load(authKey);
      expect(Option.getOrThrow(stored)).toMatchObject({
        handle: "@alice",
        access_token: "fixture-new-access",
        refresh_token: "fixture-new-refresh",
      });
      expect(Option.isNone(yield* (yield* PendingDeviceLoginStore).load())).toBe(true);
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

      // The established session is what a subsequent command presents.
      expect(yield* currentToken(authSelectedRegistry)).toBe("fixture-new-access");
    }).pipe(Effect.provide(ports.layer));
  });
});
