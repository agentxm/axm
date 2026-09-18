import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import { normalizeHandle } from "@agentxm/extension-model/unstable/extensions";
import { defineSpecification } from "@agentxm/specification-metadata";

import { TokenExchange, TokenExchangeTest } from "../authentication/auth-client.js";
import {
  RefreshUnavailable,
  RegistryAccessFailed,
  SessionEnded,
} from "../authentication/errors.js";
import {
  CredentialStore,
  CredentialStoreSessionLive,
  CredentialStoreTest,
} from "./credential-store.js";
import { SessionRefresher, SessionRefresherLive } from "./session-refresh.js";
import { CredentialStoreTokenSource } from "./schema.js";

export const specification = defineSpecification({
  requirement: "cli/session/concurrent-renewal-spends-one-refresh-token",
  title: "Concurrent invocations spend one refresh token and end with one session",
  statement:
    "When several invocations sharing a credential home renew the same session at once, AXM shall present the refresh token to the Registry once, leave exactly one valid session stored, answer every invocation with the session that was stored, and, when the Registry ends the session, erase it and answer every invocation that it ended without presenting the refused refresh token again.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "packages/supporting/registry-access/src/credentials/session-refresh.ts",
    "packages/supporting/registry-access/src/credentials/credential-store.ts",
  ],
  supersedes: [],
  assumptions: [
    "Registry refresh tokens rotate with reuse detection: presenting a spent one ends the whole family.",
  ],
  openQuestions: [],
});

const registry = "https://registry.example.test";
const handle = normalizeHandle("@alice");
const expiry = DateTime.makeUnsafe("1970-01-01T00:02:00.000Z");
const renewedExpiry = DateTime.makeUnsafe("1970-01-01T01:00:00.000Z");

/** Ten invocations, all holding the session as it was before any of them ran. */
const CONCURRENT_INVOCATIONS = 10;

const held = new CredentialStoreTokenSource({
  token: "stored-access",
  refresh_token: "stored-refresh",
  expires_at: expiry,
  registryUrl: registry,
});

const storedSession = {
  version: 1 as const,
  registries: {
    [registry]: {
      accounts: {
        [handle]: {
          access_token: "stored-access",
          refresh_token: "stored-refresh",
          expires_at: expiry,
          active: true,
        },
      },
    },
  },
};

/**
 * One refresher over one credential home, with a Registry that refuses any
 * refresh token it has already seen — the reuse detection the real one
 * performs.
 */
const harness = (outcome: "rotates" | "ends") =>
  Effect.gen(function* () {
    const presented = yield* Ref.make<ReadonlyArray<string>>([]);
    const exchange = TokenExchangeTest({
      refreshToken: (token, registryUrl) =>
        Ref.modify(presented, (seen) => [seen.includes(token), [...seen, token]] as const).pipe(
          Effect.flatMap((reused) =>
            reused || outcome === "ends"
              ? Effect.fail(new SessionEnded({ registryUrl }))
              : Effect.succeed({
                  access_token: "renewed-access",
                  refresh_token: "renewed-refresh",
                  expires_at: renewedExpiry,
                }),
          ),
        ),
    });
    return { presented, exchange };
  });

/**
 * One credential home: the stored session and the Registry every invocation
 * shares.
 */
const credentialHome = (exchange: Layer.Layer<TokenExchange>) =>
  Layer.mergeAll(exchange, CredentialStoreTest("restricted-file", storedSession));

/**
 * One invocation over that home. Each has its own refresher and its own
 * per-session read memo, exactly as separate processes do, so nothing one of
 * them learned is visible to another except through the store.
 */
const invocation = <A, E>(use: (refresher: SessionRefresher["Service"]) => Effect.Effect<A, E>) =>
  Effect.flatMap(SessionRefresher, use).pipe(
    Effect.provide(
      Layer.fresh(Layer.provide(SessionRefresherLive, Layer.fresh(CredentialStoreSessionLive))),
    ),
  );

describe("Concurrent session renewal", () => {
  it.effect("spends the refresh token once and leaves one valid session", () =>
    Effect.gen(function* () {
      const { presented, exchange } = yield* harness("rotates");

      const results = yield* Effect.forEach(
        Array.from({ length: CONCURRENT_INVOCATIONS }),
        () => invocation((refresher) => refresher.renew(held)),
        { concurrency: "unbounded" },
      ).pipe(Effect.provide(credentialHome(exchange)));

      expect(yield* Ref.get(presented)).toEqual(["stored-refresh"]);
      expect(results.map((credential) => credential.token)).toEqual(
        Array.from({ length: CONCURRENT_INVOCATIONS }, () => "renewed-access"),
      );
    }),
  );

  it.effect("tells every invocation the session ended, without spending it twice", () =>
    Effect.gen(function* () {
      const { presented, exchange } = yield* harness("ends");

      // The first invocation to be refused erases the session, so the others
      // find none and never present the refused refresh token again.
      const failures = yield* Effect.forEach(
        Array.from({ length: CONCURRENT_INVOCATIONS }),
        () => invocation((refresher) => Effect.flip(refresher.renew(held))),
        { concurrency: "unbounded" },
      ).pipe(Effect.provide(credentialHome(exchange)));

      expect(yield* Ref.get(presented)).toEqual(["stored-refresh"]);
      expect(failures.map((failure) => failure._tag)).toEqual(
        Array.from({ length: CONCURRENT_INVOCATIONS }, () => "SessionEnded"),
      );
      expect(failures.some((failure) => failure instanceof RefreshUnavailable)).toBe(false);
    }),
  );

  it.effect("adopts the session another invocation already rotated", () =>
    Effect.gen(function* () {
      const { presented, exchange } = yield* harness("rotates");

      yield* Effect.gen(function* () {
        const first = yield* invocation((refresher) => refresher.renew(held));
        expect(first.token).toBe("renewed-access");

        // A second invocation still holds the old credential and remembers
        // nothing. It re-reads the store under the lock and takes what it
        // finds rather than presenting a refresh token the Registry has seen.
        const second = yield* invocation((refresher) => refresher.renew(held));
        expect(second).toEqual(first);
        expect(yield* Ref.get(presented)).toEqual(["stored-refresh"]);

        const store = yield* CredentialStore;
        expect(Option.getOrThrow(yield* store.load(registry))).toMatchObject({
          access_token: "renewed-access",
          refresh_token: "renewed-refresh",
        });
      }).pipe(Effect.provide(credentialHome(exchange)));
    }),
  );

  it.effect("remembers a renewal it could not keep as the end of the session", () =>
    Effect.gen(function* () {
      const { presented, exchange } = yield* harness("rotates");
      const refusingStore = Layer.effect(
        CredentialStore,
        Effect.map(CredentialStore, (store) => ({
          ...store,
          save: () =>
            Effect.fail(
              new RegistryAccessFailed({ category: "auth", detail: "Fixture store is read-only" }),
            ),
        })),
      ).pipe(Layer.provide(CredentialStoreTest("restricted-file", storedSession)));

      const failures = yield* invocation((refresher) =>
        Effect.all([Effect.flip(refresher.renew(held)), Effect.flip(refresher.renew(held))]),
      ).pipe(Effect.provide(Layer.mergeAll(exchange, refusingStore)));

      // The refresh token was spent on the first attempt and its replacement
      // was lost, so a second attempt would present a spent token.
      expect(failures.map((failure) => failure._tag)).toEqual([
        "RegistryAccessFailed",
        "SessionEnded",
      ]);
      expect(yield* Ref.get(presented)).toEqual(["stored-refresh"]);
    }),
  );
});
