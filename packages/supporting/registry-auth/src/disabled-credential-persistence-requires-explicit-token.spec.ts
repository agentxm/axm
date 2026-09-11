import { describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { defineSpecification } from "@agentxm/specification-metadata";

import { CredentialStore } from "./credential-store.js";
import { AuthTokenPolicyRequired } from "./errors.js";
import { currentToken } from "./identity.js";
import { AuthEnvironment } from "./internal/environment.js";
import { login } from "./login.js";
import { PendingDeviceLoginStore } from "./pending-device-login-store.js";
import {
  authCredentialFile,
  authRegistry,
  deviceLoginRequest,
  makeAuthPorts,
} from "./spec-support/test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/disabled-credential-persistence-requires-explicit-token",
  title: "Environments without session storage require explicit tokens",
  statement:
    "When persisted credentials are disabled, AXM shall refuse sign-in and saved-session authentication with the explicit-token policy failure while allowing commands to use an explicitly supplied environment token.",
  class: "functional",
  role: "experience",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["packages/supporting/registry-auth/src/credential-store.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
  limitations: [
    {
      limitation:
        "The refusal is the typed explicit-token policy failure; that the boundary renders it as `auth_required` naming AXM_TOKEN_FILE is a rendering decision this capability cannot observe, witnessed by apps/cli/src/feature-errors.test.ts.",
      retirementCondition:
        "An apps/cli specification owns the rendered explicit-token guidance, or the guidance becomes a carried field of the typed failure.",
    },
  ],
});

describe("Disabled credential persistence", () => {
  it.effect("requires explicit credentials and does not start a persistent sign-in", () => {
    const ports = makeAuthPorts({
      credentials: authCredentialFile,
      allowsPersistedCredentials: false,
    });
    return Effect.gen(function* () {
      const store = yield* CredentialStore;
      const before = yield* store.load(authRegistry);

      // Sign-in may not create a session it cannot persist.
      expect(yield* login(deviceLoginRequest(), authRegistry).pipe(Effect.flip)).toBeInstanceOf(
        AuthTokenPolicyRequired,
      );
      // A saved session may not be used either.
      expect(yield* currentToken(authRegistry).pipe(Effect.flip)).toBeInstanceOf(
        AuthTokenPolicyRequired,
      );

      expect(ports.requestedScopes).toEqual([]);
      expect(Option.isNone(yield* (yield* PendingDeviceLoginStore).load())).toBe(true);
      expect(yield* store.load(authRegistry)).toEqual(before);

      // An explicitly supplied token is still accepted in the same environment.
      expect(
        yield* currentToken(authRegistry).pipe(
          Effect.provideService(
            AuthEnvironment,
            ConfigProvider.fromEnvRecord({ AXM_TOKEN: "fixture-explicit-token" }),
          ),
        ),
      ).toBe("fixture-explicit-token");
    }).pipe(Effect.provide(ports.layer));
  });
});
