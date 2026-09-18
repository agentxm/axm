import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { RegistryRequestFailed, RegistryUrl } from "@agentxm/registry-client";
import { normalizeHandle } from "@agentxm/extension-model/unstable/extensions";
import { defineSpecification } from "@agentxm/specification-metadata";

import { TokenExchangeTest } from "../authentication/auth-client.js";
import {
  RefreshUnavailable,
  RegistryAccessFailed,
  SessionEnded,
} from "../authentication/errors.js";
import {
  CredentialStore,
  CredentialStoreSessionLive,
  CredentialStoreTest,
} from "../credentials/credential-store.js";
import { SessionRefresherLive } from "../credentials/session-refresh.js";
import { AuthMiddlewareLive } from "./auth-middleware.js";

export const specification = defineSpecification({
  requirement: "cli/session/renews-the-stored-session-once",
  title: "The transport renews a stored session, and nothing else does",
  statement:
    "When an invocation presents a stored session, AXM shall renew it before a request whose access token expires within five minutes and once after the Registry rejects it, present the renewed credential on a single retry, report being signed out when the Registry refuses the renewal, keep the session and fail the request with the reason when the Registry cannot be reached or credential storage refuses, never reporting either as being signed out, and never renew an ambient credential.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics", "machine-automation"],
  methods: ["example"],
  derivedFrom: [
    "packages/supporting/registry-access/src/adapters/auth-middleware.ts",
    "packages/supporting/registry-access/src/credentials/session-refresh.ts",
  ],
  supersedes: ["cli/whoami/refreshes-rejected-stored-credentials"],
  assumptions: [],
  openQuestions: [],
});

const registry = "https://registry.example.test";
const handle = normalizeHandle("@alice");

const storedSession = (expiresAt: DateTime.Utc) => ({
  version: 1 as const,
  registries: {
    [registry]: {
      accounts: {
        [handle]: {
          access_token: "stored-access",
          refresh_token: "stored-refresh",
          expires_at: expiresAt,
          active: true,
        },
      },
    },
  },
});

// Expiries are absolute, against the test clock these examples run on: an
// hour out is comfortably outside the five-minute renewal skew, two minutes
// out is inside it.
const farFuture = () => DateTime.makeUnsafe("1970-01-01T01:00:00.000Z");
const insideSkew = () => DateTime.makeUnsafe("1970-01-01T00:02:00.000Z");

interface Harness {
  readonly expiresAt: DateTime.Utc;
  readonly refresh?: ReturnType<typeof TokenExchangeTest>;
  /** Replaces the credential home's refresh lock. */
  readonly lock?: CredentialStore["Service"]["withRefreshLock"];
  readonly respond: (request: HttpClientRequest.HttpClientRequest) => Response;
}

const harness = ({ expiresAt, refresh, lock, respond }: Harness) => {
  const presented: Array<string | undefined> = [];
  const transport = HttpClient.make((request) =>
    Effect.sync(() => {
      const header = request.headers["authorization"];
      presented.push(typeof header === "string" ? header.replace("Bearer ", "") : undefined);
      return HttpClientResponse.fromWeb(request, respond(request));
    }),
  );
  const transportLayer = Layer.succeed(HttpClient.HttpClient, transport);
  const home = CredentialStoreTest("restricted-file", storedSession(expiresAt));
  const storeLayer = Layer.provide(
    CredentialStoreSessionLive,
    lock === undefined
      ? home
      : Layer.effect(
          CredentialStore,
          Effect.map(CredentialStore, (store) => ({ ...store, withRefreshLock: lock })),
        ).pipe(Layer.provide(home)),
  );
  const exchangeLayer =
    refresh ??
    TokenExchangeTest({
      refreshToken: () =>
        Effect.succeed({
          access_token: "renewed-access",
          refresh_token: "renewed-refresh",
          expires_at: farFuture(),
        }),
    });
  const refresherLayer = Layer.provide(
    SessionRefresherLive,
    Layer.mergeAll(exchangeLayer, storeLayer),
  );
  const registryUrlLayer = Layer.succeed(RegistryUrl, registry);
  const middleware = Layer.provide(
    AuthMiddlewareLive,
    Layer.mergeAll(transportLayer, storeLayer, refresherLayer, registryUrlLayer),
  );
  return { presented, layer: Layer.mergeAll(middleware, storeLayer, registryUrlLayer) };
};

const call = Effect.gen(function* () {
  const client = yield* HttpClient.HttpClient;
  return yield* client.execute(HttpClientRequest.get(`${registry}/v1/extensions/@alice`));
});

describe("Stored session renewal", () => {
  it.effect("renews before a request whose access token is about to expire", () => {
    const { presented, layer } = harness({
      expiresAt: insideSkew(),
      respond: () => new Response("ok", { status: 200 }),
    });

    return Effect.gen(function* () {
      expect((yield* call).status).toBe(200);
      // The expiring token is never spent: the renewed one goes out first.
      expect(presented).toEqual(["renewed-access"]);
      expect(Option.getOrThrow(yield* (yield* CredentialStore).load(registry))).toMatchObject({
        access_token: "renewed-access",
        refresh_token: "renewed-refresh",
      });
    }).pipe(Effect.provide(layer));
  });

  it.effect("renews once after the Registry rejects the session, and retries once", () => {
    const { presented, layer } = harness({
      expiresAt: farFuture(),
      respond: (request) =>
        request.headers["authorization"] === "Bearer renewed-access"
          ? new Response("ok", { status: 200 })
          : new Response("unauthorized", { status: 401 }),
    });

    return Effect.gen(function* () {
      expect((yield* call).status).toBe(200);
      expect(presented).toEqual(["stored-access", "renewed-access"]);

      // The renewed session is what the next request presents; nothing renews
      // a second time.
      expect((yield* call).status).toBe(200);
      expect(presented).toEqual(["stored-access", "renewed-access", "renewed-access"]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("reports being signed out when the Registry refuses the renewal", () => {
    const { presented, layer } = harness({
      expiresAt: farFuture(),
      refresh: TokenExchangeTest({
        refreshToken: (_token, registryUrl) => Effect.fail(new SessionEnded({ registryUrl })),
      }),
      respond: () => new Response("unauthorized", { status: 401 }),
    });

    return Effect.gen(function* () {
      // The Registry's own refusal stands as the answer, which is what the
      // boundary renders as the one signed-out result.
      expect((yield* call).status).toBe(401);
      expect(presented).toEqual(["stored-access"]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("keeps the session and fails transport when the Registry cannot be reached", () => {
    const { layer } = harness({
      expiresAt: insideSkew(),
      refresh: TokenExchangeTest({
        refreshToken: (_token, registryUrl) =>
          Effect.fail(
            new RefreshUnavailable({ registryUrl, detail: "The Registry could not be reached." }),
          ),
      }),
      respond: () => new Response("ok", { status: 200 }),
    });

    return Effect.gen(function* () {
      const failure = yield* call.pipe(Effect.flip);
      expect(failure.reason._tag).toBe("TransportError");
      // Nothing was signed out: the credential is exactly where it was.
      expect(Option.getOrThrow(yield* (yield* CredentialStore).load(registry))).toMatchObject({
        access_token: "stored-access",
      });
    }).pipe(Effect.provide(layer));
  });

  it.effect("fails the request with the reason when credential storage refuses", () => {
    const { presented, layer } = harness({
      expiresAt: farFuture(),
      lock: () =>
        Effect.fail(
          new RegistryAccessFailed({
            category: "auth",
            detail: "Could not lock the session for refresh",
          }),
        ),
      respond: () => new Response("unauthorized", { status: 401 }),
    });

    return Effect.gen(function* () {
      const failure = yield* call.pipe(Effect.flip);
      // The rejection that prompted the renewal is not the answer: the person
      // is not signed out, their session could not be renewed.
      const carried = failure.reason._tag === "TransportError" ? failure.reason.cause : undefined;
      expect(carried).toBeInstanceOf(RegistryRequestFailed);
      expect(carried instanceof RegistryRequestFailed ? carried.detail : null).toBe(
        "Your session could not be renewed: Could not lock the session for refresh",
      );
      expect(presented).toEqual(["stored-access"]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("never renews a credential the invocation did not store", () => {
    const refreshes: Array<string> = [];
    const { presented, layer } = harness({
      expiresAt: insideSkew(),
      refresh: TokenExchangeTest({
        refreshToken: (token) =>
          Effect.sync(() => {
            refreshes.push(token);
            return {
              access_token: "renewed-access",
              refresh_token: "renewed-refresh",
              expires_at: farFuture(),
            };
          }),
      }),
      respond: () => new Response("unauthorized", { status: 401 }),
    });

    return Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient;
      const request = HttpClientRequest.get(`${registry}/v1/extensions/@alice`).pipe(
        HttpClientRequest.bearerToken("ambient-token"),
      );
      expect((yield* client.execute(request)).status).toBe(401);
      expect(presented).toEqual(["ambient-token"]);
      expect(refreshes).toEqual([]);
    }).pipe(Effect.provide(layer));
  });
});
