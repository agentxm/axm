import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Deferred from "effect/Deferred";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import { decodeHttpRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import { defineSpecification } from "@agentxm/specification-metadata";

import { CredentialStore } from "./credential-store.js";
import { RegistryRequestFailed } from "@agentxm/registry-client";
import { SignedOut } from "../authentication/errors.js";
import { currentToken } from "../authentication/identity.js";
import { logout } from "../authentication/logout.js";
import {
  authCredentialFile,
  authRegistryHost,
  makeAuthPorts,
  authSelectedRegistry,
  authKey,
  otherAuthKey,
} from "../authentication/test-support/test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/logout/erases-selected-registry-credentials",
  title: "Sign-out removes only the selected Registry session",
  statement:
    "When logout finds saved credentials, AXM shall remove the session saved for the selected Registry's origin, whichever equivalent spelling selected it, even if remote revocation fails, leaving every other origin's credentials available.",
  class: "functional",
  role: "experience",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "packages/supporting/registry-access/src/authentication/logout.ts",
    "cli/credentials-stay-with-their-registry",
  ],
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
        afterCredentialRead: (key) =>
          key === authKey
            ? Deferred.succeed(readStarted, undefined).pipe(Effect.asVoid)
            : Effect.void,
      });
      yield* Effect.gen(function* () {
        const store = yield* CredentialStore;
        const otherBefore = yield* store.load(otherAuthKey);
        const reader = yield* Effect.forkChild(store.load(authKey));
        yield* Deferred.await(readStarted);

        expect(yield* logout(authSelectedRegistry)).toMatchObject({ _tag: "SignedOut" });
        yield* Fiber.join(reader);

        expect(yield* currentToken(authSelectedRegistry).pipe(Effect.flip)).toBeInstanceOf(
          SignedOut,
        );
        expect(yield* store.load(otherAuthKey)).toEqual(otherBefore);
      }).pipe(Effect.provide(layer));
    }),
  );

  for (const remoteRevoke of ["succeeds", "fails"] as const) {
    it.effect(remoteRevoke, () => {
      const revoked: Array<string> = [];
      const { layer } = makeAuthPorts({
        credentials: authCredentialFile,
        exchange: {
          revokeToken: (token) =>
            Effect.gen(function* () {
              revoked.push(token);
              if (remoteRevoke === "fails")
                return yield* new RegistryRequestFailed({
                  category: "network",
                  detail: "Fixture Registry unavailable",
                });
            }),
        },
      });
      return Effect.gen(function* () {
        const credentials = yield* CredentialStore;
        const otherBefore = yield* credentials.load(otherAuthKey);

        expect(yield* logout(authSelectedRegistry)).toEqual({
          _tag: "SignedOut",
          registryHost: authRegistryHost,
          handle: "@alice",
          revokedRemotely: remoteRevoke === "succeeds",
        });
        expect(revoked).toEqual(["fixture-stored-refresh"]);
        expect(Option.isNone(yield* credentials.load(authKey))).toBe(true);
        expect(yield* credentials.load(otherAuthKey)).toEqual(otherBefore);

        // The removed session is no longer available to a subsequent command.
        expect(yield* currentToken(authSelectedRegistry).pipe(Effect.flip)).toBeInstanceOf(
          SignedOut,
        );

        expect(yield* logout(authSelectedRegistry)).toEqual({
          _tag: "NotSignedIn",
          registryHost: authRegistryHost,
        });
        expect(revoked).toHaveLength(1);
      }).pipe(Effect.provide(layer));
    });
  }

  it.effect("an equivalent spelling of the selected Registry signs out the same session", () => {
    const { layer } = makeAuthPorts({ credentials: authCredentialFile });
    return Effect.gen(function* () {
      const credentials = yield* CredentialStore;
      const otherBefore = yield* credentials.load(otherAuthKey);
      const spelled = {
        ...authSelectedRegistry,
        endpoint: decodeHttpRegistryEndpointSync("https://REGISTRY.example.test:443/"),
      };
      expect(yield* logout(spelled)).toMatchObject({ _tag: "SignedOut", handle: "@alice" });
      expect(Option.isNone(yield* credentials.load(authKey))).toBe(true);
      expect(yield* credentials.load(otherAuthKey)).toEqual(otherBefore);
    }).pipe(Effect.provide(layer));
  });
});
