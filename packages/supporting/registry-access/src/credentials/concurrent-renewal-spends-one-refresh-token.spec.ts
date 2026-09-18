import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import { normalizeHandle } from "@agentxm/extension-model/unstable/extensions";
import { defineSpecification } from "@agentxm/specification-metadata";

import { TokenExchange, TokenExchangeTest } from "../authentication/auth-client.js";
import { RefreshUnavailable, SessionEnded } from "../authentication/errors.js";
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
    "When several invocations sharing a credential home renew the same session at once, AXM shall present the refresh token to the Registry once, leave exactly one valid session stored, answer every invocation with the session that was stored, and, when the Registry ends the session, answer every invocation that it ended without presenting a spent refresh token again.",
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

const layerFor = (exchange: Layer.Layer<TokenExchange>) => {
  const store = Layer.provide(
    CredentialStoreSessionLive,
    CredentialStoreTest("restricted-file", storedSession),
  );
  return Layer.mergeAll(Layer.provide(SessionRefresherLive, Layer.merge(exchange, store)), store);
};

describe("Concurrent session renewal", () => {
  it.effect("spends the refresh token once and leaves one valid session", () =>
    Effect.gen(function* () {
      const { presented, exchange } = yield* harness("rotates");

      const results = yield* Effect.gen(function* () {
        const refresher = yield* SessionRefresher;
        return yield* Effect.forEach(
          Array.from({ length: CONCURRENT_INVOCATIONS }),
          () => refresher.renew(held),
          { concurrency: "unbounded" },
        );
      }).pipe(Effect.provide(layerFor(exchange)));

      expect(yield* Ref.get(presented)).toEqual(["stored-refresh"]);
      expect(results.map((credential) => credential.token)).toEqual(
        Array.from({ length: CONCURRENT_INVOCATIONS }, () => "renewed-access"),
      );
    }),
  );

  it.effect("tells every invocation the session ended, without spending it twice", () =>
    Effect.gen(function* () {
      const { presented, exchange } = yield* harness("ends");

      const failures = yield* Effect.gen(function* () {
        const refresher = yield* SessionRefresher;
        return yield* Effect.forEach(
          Array.from({ length: CONCURRENT_INVOCATIONS }),
          () => Effect.flip(refresher.renew(held)),
          { concurrency: "unbounded" },
        );
      }).pipe(Effect.provide(layerFor(exchange)));

      expect(yield* Ref.get(presented)).toEqual(["stored-refresh"]);
      expect(failures.map((failure) => failure._tag)).toEqual(
        Array.from({ length: CONCURRENT_INVOCATIONS }, () => "SessionEnded"),
      );
      expect(failures.some((failure) => failure instanceof RefreshUnavailable)).toBe(false);
    }),
  );

  it.effect("adopts the session another holder of the lock already rotated", () =>
    Effect.gen(function* () {
      const { presented, exchange } = yield* harness("rotates");

      yield* Effect.gen(function* () {
        const refresher = yield* SessionRefresher;
        const store = yield* CredentialStore;

        const first = yield* refresher.renew(held);
        expect(first.token).toBe("renewed-access");

        // A second invocation still holding the old credential re-reads the
        // store rather than presenting a refresh token the Registry has seen.
        const second = yield* refresher.renew(held);
        expect(second.token).toBe("renewed-access");
        expect(yield* Ref.get(presented)).toEqual(["stored-refresh"]);

        expect(Option.getOrThrow(yield* store.load(registry))).toMatchObject({
          access_token: "renewed-access",
          refresh_token: "renewed-refresh",
        });
      }).pipe(Effect.provide(layerFor(exchange)));
    }),
  );
});
