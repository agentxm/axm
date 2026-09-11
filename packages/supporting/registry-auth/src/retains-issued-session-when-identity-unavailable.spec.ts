import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { defineSpecification } from "@agentxm/specification-metadata";

import { CredentialStore } from "./credential-store.js";
import { initiateDeviceLogin, resumeDeviceLogin } from "./device-login.js";
import { RegistryAuthFailed } from "./errors.js";
import { currentIdentity } from "./identity.js";
import {
  authExpiry,
  authHandle,
  authRegistry,
  authRegistryHost,
  machineOutputPresenter,
  makeAuthPorts,
} from "./spec-support/test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/login/retains-issued-session-when-identity-unavailable",
  title: "Sign-in retains an issued session when identity lookup is unavailable",
  statement:
    "When device authorization issues a session but identity lookup is temporarily unavailable, AXM shall retain the usable session without presenting an unverified identity, allowing later identity inspection to report the canonical Registry account.",
  class: "functional",
  role: "experience",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["packages/supporting/registry-auth/src/device-login.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Identity lookup recovery", () => {
  it.effect("retains the issued session and reports only the later verified account", () => {
    let identityAvailable = false;
    const ports = makeAuthPorts({
      presenter: machineOutputPresenter,
      auth: {
        getMe: (token) =>
          Effect.suspend(() => {
            expect(token).toBe("fixture-new-access");
            return identityAvailable
              ? Effect.succeed({
                  userHandle: authHandle,
                  tokenType: "session",
                  scopes: ["extensions:read"],
                  resourceRestrictions: { extensions: null },
                  expiresAt: authExpiry,
                })
              : Effect.fail(
                  new RegistryAuthFailed({
                    category: "internal",
                    detail: "Fixture identity temporarily unavailable",
                  }),
                );
          }),
      },
    });
    return Effect.gen(function* () {
      yield* initiateDeviceLogin(authRegistry, {
        openBrowser: false,
        scopes: ["extensions:read"],
      });
      yield* resumeDeviceLogin(authRegistry);

      const credentials = Option.getOrThrow(yield* (yield* CredentialStore).load(authRegistry));
      expect(credentials.access_token).toBe("fixture-new-access");
      // No handle is presented while the Registry cannot confirm one.
      expect(ports.presenterState.loginSuccesses).toEqual([
        { status: "logged-in", registryHost: authRegistryHost },
      ]);

      identityAvailable = true;
      expect(yield* currentIdentity(authRegistry)).toMatchObject({
        user: "@alice",
        registry: authRegistry,
        scopes: ["extensions:read"],
      });

      // Secondary sweep; output redaction itself is owned by
      // cli/errors-do-not-disclose-credentials and
      // cli/whoami/reports-safe-effective-identity.
      for (const privateValue of ["@unknown", "fixture-new-access", "fixture-new-refresh"]) {
        expect(JSON.stringify(ports.presenterState)).not.toContain(privateValue);
      }
    }).pipe(Effect.provide(ports.layer));
  });
});
