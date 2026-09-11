import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Deferred from "effect/Deferred";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import { defineSpecification } from "@agentxm/specification-metadata";

import {
  CredentialStore,
  AuthLoginRequired,
  RegistryAuthFailed,
  currentToken,
  logout,
} from "./index.js";
import {
  authCredentialFile,
  authRegistry,
  authRegistryHost,
  makeAuthPorts,
  otherAuthRegistry,
} from "./spec-support/test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/logout/erases-selected-registry-credentials",
  title: "Sign-out removes only the selected Registry session",
  statement:
    "When logout finds saved credentials, AXM shall remove the selected Registry session even if remote revocation fails, leaving other Registry credentials available.",
  class: "functional",
  role: "experience",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["packages/supporting/registry-auth/src/logout.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Local sign-out", () => {
  it.effect("a concurrent credential read cannot restore the signed-out session", () =>
    Effect.gen(function* () {
      const readStarted = yield* Deferred.make<void>();
      const { layer } = makeAuthPorts({
        credentials: authCredentialFile,
        afterCredentialRead: (registryUrl) =>
          registryUrl === authRegistry
            ? Deferred.succeed(readStarted, undefined).pipe(Effect.asVoid)
            : Effect.void,
      });
      yield* Effect.gen(function* () {
        const store = yield* CredentialStore;
        const otherBefore = yield* store.load(otherAuthRegistry);
        const reader = yield* Effect.forkChild(store.load(authRegistry));
        yield* Deferred.await(readStarted);

        expect(yield* logout(authRegistry)).toMatchObject({ _tag: "SignedOut" });
        yield* Fiber.join(reader);

        expect(yield* currentToken(authRegistry).pipe(Effect.flip)).toBeInstanceOf(
          AuthLoginRequired,
        );
        expect(yield* store.load(otherAuthRegistry)).toEqual(otherBefore);
      }).pipe(Effect.provide(layer));
    }),
  );

  for (const remoteRevoke of ["succeeds", "fails"] as const) {
    it.effect(remoteRevoke, () => {
      const revoked: Array<string> = [];
      const { layer } = makeAuthPorts({
        credentials: authCredentialFile,
        auth: {
          revokeToken: (token) =>
            Effect.gen(function* () {
              revoked.push(token);
              if (remoteRevoke === "fails")
                return yield* new RegistryAuthFailed({
                  category: "auth",
                  detail: "Fixture Registry unavailable",
                });
            }),
        },
      });
      return Effect.gen(function* () {
        const credentials = yield* CredentialStore;
        const otherBefore = yield* credentials.load(otherAuthRegistry);

        expect(yield* logout(authRegistry)).toEqual({
          _tag: "SignedOut",
          registryHost: authRegistryHost,
          handle: "@alice",
          revokedRemotely: remoteRevoke === "succeeds",
        });
        expect(revoked).toEqual(["fixture-stored-refresh"]);
        expect(Option.isNone(yield* credentials.load(authRegistry))).toBe(true);
        expect(yield* credentials.load(otherAuthRegistry)).toEqual(otherBefore);

        // The removed session is no longer available to a subsequent command.
        expect(yield* currentToken(authRegistry).pipe(Effect.flip)).toBeInstanceOf(
          AuthLoginRequired,
        );

        expect(yield* logout(authRegistry)).toEqual({
          _tag: "NotSignedIn",
          registryHost: authRegistryHost,
        });
        expect(revoked).toHaveLength(1);
      }).pipe(Effect.provide(layer));
    });
  }
});
