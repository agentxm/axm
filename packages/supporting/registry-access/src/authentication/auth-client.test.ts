/**
 * Unit tests for AuthClient service.
 *
 * Covers: device flow initiation, device token polling (all RFC 8628 states),
 * token refresh, token revocation, and identity queries.
 *
 * Tests exercise the generated registry client integration by providing
 * mock HTTP responses that match the generated schema expectations.
 */

import { describe, it } from "@effect/vitest";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientError from "effect/unstable/http/HttpClientError";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as TestClock from "effect/testing/TestClock";
import { expect } from "vitest";

import {
  AuthClient,
  AuthClientLive,
  LOGIN_SCOPE,
  TokenExchange,
  TokenExchangeLive,
  pollOnce,
} from "./auth-client.js";
import {
  isRegistryClientFailure,
  RegistryUrl,
  type RegistryClientFailure,
} from "@agentxm/registry-client";
import { RegistryAccessFailed, type AuthError } from "./errors.js";

const asRegistryFailure = (error: AuthError): RegistryClientFailure => {
  if (isRegistryClientFailure(error)) return error;
  throw new Error(`Expected a registry client failure, got ${error._tag}`);
};

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const REGISTRY_URL = "https://registry.agentxm.ai";

const makeMockHttpClient = (handler: (request: HttpClientRequest.HttpClientRequest) => Response) =>
  HttpClient.make((request) =>
    Effect.sync(() => HttpClientResponse.fromWeb(request, handler(request))),
  );

const makeNetworkErrorHttpClient = () =>
  HttpClient.make((request) =>
    Effect.fail(
      new HttpClientError.HttpClientError({
        reason: new HttpClientError.TransportError({
          request,
          cause: new Error("ECONNREFUSED"),
          description: "Connection refused",
        }),
      }),
    ),
  );

const makeTestLayer = (
  handler: (request: HttpClientRequest.HttpClientRequest) => Response,
  registryUrl = REGISTRY_URL,
) => {
  const httpLayer = Layer.succeed(HttpClient.HttpClient, makeMockHttpClient(handler));
  const registryUrlLayer = Layer.succeed(RegistryUrl, registryUrl);
  return Layer.provide(AuthClientLive, Layer.mergeAll(httpLayer, registryUrlLayer));
};

/** Build a valid token endpoint JSON response body. */
const makeTokenResponse = (overrides?: {
  readonly access_token?: string;
  readonly refresh_token?: string;
  readonly expires_at?: string;
  readonly expires_in?: number;
}) => ({
  access_token: overrides?.access_token ?? "axm_ses_new",
  refresh_token: overrides?.refresh_token ?? "axm_ref_new",
  token_type: "Bearer",
  expires_in: overrides?.expires_in ?? 3600,
  expires_at: overrides?.expires_at ?? new Date(Date.now() + 3600 * 1000).toISOString(),
});

/** Build a valid DeviceTokenOAuthError-compatible JSON error body. */
type OAuthDeviceError = "authorization_pending" | "slow_down" | "expired_token" | "access_denied";

const makeOAuthError = (error: OAuthDeviceError) => ({
  kind: "TokenOAuthError",
  error,
  error_description: `OAuth error: ${error}`,
});

const internalErrorResponse = {
  type: "https://registry.agentxm.ai/problems/internal_error",
  title: "Internal Server Error",
  status: 500,
  detail: "Publication authorization could not be exchanged.",
  code: "internal_error",
};

/** Build an RFC 9457 DecodeErrorResponse-compatible JSON error body. */
const makeDecodeError = (code: string, status: number) => ({
  kind: "DecodeErrorResponse",
  type: "urn:ietf:params:problem:decode-error",
  title: "Decode Error",
  status,
  detail: `Decode error: ${code}`,
  code,
});

/** Build a valid AuthGetMe200-compatible JSON response body. */
const makeMeResponse = () => ({
  user: {
    id: "user_01h455vb4pexka56gq5w2r7cpc",
    handle: "@alice",
    email: "alice@example.com",
  },
  token: {
    id: "tok_01h455vb4pexka56gq5w2r7cpc",
    type: "session",
    name: null,
    permissions: null,
    authority: "account",
    expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    approved_at: new Date(Date.now() - 60 * 1000).toISOString(),
  },
});

// Build an UnauthorizedError-compatible JSON error body.
const makeUnauthorizedError = () => ({
  kind: "UnauthorizedError",
  type: "urn:ietf:params:problem:unauthorized",
  title: "Unauthorized",
  status: 401,
  detail: "Invalid or expired token",
  code: "unauthorized",
});

// Build a RefreshTokenError-compatible JSON error body.
const makeRefreshTokenError = () => ({
  kind: "RefreshTokenError",
  type: "urn:ietf:params:problem:refresh-token",
  title: "Refresh Token Error",
  status: 401,
  detail: "Refresh token expired or revoked",
  code: "refresh_token_expired",
});

// -----------------------------------------------------------------------------
// initiateDeviceFlow
// -----------------------------------------------------------------------------

describe("AuthClient.buildAuthorizeUrl", () => {
  for (const [registryUrl, authorizationOrigin] of [
    ["http://localhost:4300", "http://localhost:4200"],
    ["http://localhost:4310", "http://localhost:4210"],
    ["http://127.0.0.1:4320", "http://127.0.0.1:4220"],
    ["http://[::1]:4399", "http://[::1]:4299"],
  ] as const) {
    it.effect(`uses ${authorizationOrigin} for ${registryUrl}`, () => {
      const layer = makeTestLayer(() => new Response(null, { status: 204 }), registryUrl);
      return Effect.gen(function* () {
        const client = yield* AuthClient;
        const authorizeUrl = new URL(
          client.buildAuthorizeUrl({
            challenge: "challenge",
            state: "state",
            redirectUri: "http://127.0.0.1:49152/callback",
          }),
        );
        expect(authorizeUrl.origin).toBe(authorizationOrigin);
        expect(client.getAuthorizationIssuer()).toBe(authorizationOrigin);
      }).pipe(Effect.provide(layer));
    });
  }

  it.effect("includes a request expiry when provided", () => {
    const layer = makeTestLayer(() => new Response(null, { status: 204 }));
    const expiresAt = DateTime.makeUnsafe("2026-05-12T12:00:00.000Z");

    return Effect.gen(function* () {
      const client = yield* AuthClient;
      const url = new URL(
        client.buildAuthorizeUrl({
          challenge: "challenge",
          expiresAt,
          state: "state",
          redirectUri: "http://127.0.0.1:49152/callback",
        }),
      );

      expect(url.pathname).toBe("/oauth/authorize");
      expect(url.searchParams.get("request_expires_at")).toBe(DateTime.formatIso(expiresAt));
      expect(url.searchParams.get("scope")).toBe(LOGIN_SCOPE);
    }).pipe(Effect.provide(layer));
  });

  // Wire shape for the authorization request, demoted here from
  // cli/login/uses-matching-hosted-authorization-origin, which states only the
  // origin and issuer rule.
  it.effect("binds the request with PKCE S256, the state, and the loopback redirect", () => {
    const layer = makeTestLayer(() => new Response(null, { status: 204 }));

    return Effect.gen(function* () {
      const client = yield* AuthClient;
      const url = new URL(
        client.buildAuthorizeUrl({
          challenge: "fixture-challenge",
          state: "fixture-state",
          redirectUri: "http://127.0.0.1:49152/callback",
        }),
      );

      expect(url.pathname).toBe("/oauth/authorize");
      expect(url.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:49152/callback");
      expect(url.searchParams.get("code_challenge_method")).toBe("S256");
      expect(url.searchParams.get("code_challenge")).toBe("fixture-challenge");
      expect(url.searchParams.get("state")).toBe("fixture-state");
    }).pipe(Effect.provide(layer));
  });
});

describe("AuthClient.initiateDeviceFlow", () => {
  it("asks for identity claims and the refresh grant, and nothing a person can do", () => {
    expect(LOGIN_SCOPE.split(" ").sort()).toEqual(["email", "offline_access", "openid", "profile"]);
  });

  it.effect("returns device flow response on success", () => {
    const layer = makeTestLayer(
      () =>
        new Response(
          JSON.stringify({
            device_code: "dev_123",
            user_code: "ABCD-1234",
            verification_uri: "https://agentxm.ai/device",
            verification_uri_complete: "https://agentxm.ai/device?user_code=ABCD-1234",
            interval: 5,
            expires_in: 900,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );

    return Effect.gen(function* () {
      const client = yield* AuthClient;
      const result = yield* client.initiateDeviceFlow();
      expect(result.device_code).toBe("dev_123");
      expect(result.user_code).toBe("ABCD-1234");
      expect(result.verification_uri).toBe("https://agentxm.ai/device");
      expect(result.verification_uri_complete).toBe(
        "https://agentxm.ai/device?user_code=ABCD-1234",
      );
      expect(result.interval).toBe(5);
      expect(result.expires_in).toBe(900);
    }).pipe(Effect.provide(layer));
  });

  it.effect("preserves a declared 400 problem response", () => {
    const layer = makeTestLayer(
      () =>
        new Response(JSON.stringify(makeDecodeError("unknown_client", 400)), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
    );

    return Effect.gen(function* () {
      const client = yield* AuthClient;
      const error = asRegistryFailure(yield* client.initiateDeviceFlow().pipe(Effect.flip));
      expect(error.category).toBe("validation");
      expect(error.detail).toBe("Decode error: unknown_client");
      expect(error.metadata?.response).toMatchObject({
        status: 400,
        problemCode: "unknown_client",
        body: makeDecodeError("unknown_client", 400),
      });
      expect(error.cause).toMatchObject({ _tag: "AuthIssueDeviceCode400" });
    }).pipe(Effect.provide(layer));
  });

  it.effect("classifies a transport-only failure as network", () => {
    const httpLayer = Layer.succeed(HttpClient.HttpClient, makeNetworkErrorHttpClient());
    const registryUrlLayer = Layer.succeed(RegistryUrl, REGISTRY_URL);
    const layer = Layer.provide(AuthClientLive, Layer.mergeAll(httpLayer, registryUrlLayer));

    return Effect.gen(function* () {
      const client = yield* AuthClient;
      const error = asRegistryFailure(yield* client.initiateDeviceFlow().pipe(Effect.flip));
      expect(error.category).toBe("network");
    }).pipe(Effect.provide(layer));
  });

  it.effect("sends correct request body", () => {
    const layer = makeTestLayer((req) => {
      expect(req.url).toContain("/v1/auth/device/code");
      expect(req.method).toBe("POST");
      return new Response(
        JSON.stringify({
          device_code: "dev_123",
          user_code: "ABCD-1234",
          verification_uri: "https://agentxm.ai/device",
          verification_uri_complete: "https://agentxm.ai/device?user_code=ABCD-1234",
          interval: 5,
          expires_in: 900,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    return Effect.gen(function* () {
      const client = yield* AuthClient;
      yield* client.initiateDeviceFlow();
    }).pipe(Effect.provide(layer));
  });
});

// -----------------------------------------------------------------------------
// pollOnce (single poll step via token endpoint)
// -----------------------------------------------------------------------------

describe("pollOnce", () => {
  it.effect("returns Success on 200 with token", () => {
    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
    const httpClient = makeMockHttpClient(
      () =>
        new Response(
          JSON.stringify(makeTokenResponse({ access_token: "axm_ses_new", expires_at: expiresAt })),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );

    return Effect.gen(function* () {
      const result = yield* pollOnce(httpClient, REGISTRY_URL, "dev_123");
      expect(result._tag).toBe("Success");
      if (result._tag === "Success") {
        expect(result.token.access_token).toBe("axm_ses_new");
        expect(DateTime.formatIso(result.token.expires_at)).toBe(expiresAt);
      }
    });
  });

  it.effect("returns Pending on authorization_pending error", () => {
    const httpClient = makeMockHttpClient(
      () =>
        new Response(JSON.stringify(makeOAuthError("authorization_pending")), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
    );

    return Effect.gen(function* () {
      const result = yield* pollOnce(httpClient, REGISTRY_URL, "dev_123");
      expect(result._tag).toBe("Pending");
    });
  });

  it.effect("returns SlowDown on slow_down error", () => {
    const httpClient = makeMockHttpClient(
      () =>
        new Response(JSON.stringify(makeOAuthError("slow_down")), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
    );

    return Effect.gen(function* () {
      const result = yield* pollOnce(httpClient, REGISTRY_URL, "dev_123");
      expect(result._tag).toBe("SlowDown");
    });
  });

  it.effect("returns AccessDenied on access_denied error", () => {
    const httpClient = makeMockHttpClient(
      () =>
        new Response(JSON.stringify(makeOAuthError("access_denied")), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
    );

    return Effect.gen(function* () {
      const result = yield* pollOnce(httpClient, REGISTRY_URL, "dev_123");
      expect(result._tag).toBe("AccessDenied");
    });
  });

  it.effect("returns ExpiredToken on expired_token error", () => {
    const httpClient = makeMockHttpClient(
      () =>
        new Response(JSON.stringify(makeOAuthError("expired_token")), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
    );

    return Effect.gen(function* () {
      const result = yield* pollOnce(httpClient, REGISTRY_URL, "dev_123");
      expect(result._tag).toBe("ExpiredToken");
    });
  });

  it.effect("preserves an undeclared 502 response after retry classification", () => {
    const httpClient = makeMockHttpClient(
      () =>
        new Response(JSON.stringify({ message: "internal error" }), {
          status: 502,
          headers: { "content-type": "application/json" },
        }),
    );

    return Effect.gen(function* () {
      const error = asRegistryFailure(
        yield* pollOnce(httpClient, REGISTRY_URL, "dev_123").pipe(Effect.flip),
      );
      expect(error.category).toBe("internal");
      expect(error.metadata?.response).toMatchObject({
        status: 502,
        body: { message: "internal error" },
      });
    });
  });

  it.effect("preserves a declared server failure after retry classification", () => {
    const httpClient = makeMockHttpClient(
      () =>
        new Response(JSON.stringify(internalErrorResponse), {
          status: 500,
          headers: { "content-type": "application/problem+json" },
        }),
    );

    return Effect.gen(function* () {
      const error = asRegistryFailure(
        yield* pollOnce(httpClient, REGISTRY_URL, "dev_123").pipe(Effect.flip),
      );
      expect(error.category).toBe("internal");
      expect(error.metadata?.response).toMatchObject({
        status: 500,
        body: internalErrorResponse,
      });
    });
  });

  it.effect("classifies a malformed 200 response as incompatible", () => {
    const httpClient = makeMockHttpClient(
      () =>
        new Response(JSON.stringify({ not: "a token" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );

    return Effect.gen(function* () {
      const error = asRegistryFailure(
        yield* pollOnce(httpClient, REGISTRY_URL, "dev_123").pipe(Effect.flip),
      );
      expect(error.category).toBe("internal");
      expect(error.detail).toBe(
        "Token exchange failed: the Registry response does not match the expected contract.",
      );
      expect(error.cause).toMatchObject({ _tag: "SchemaError" });
    });
  });
});

// -----------------------------------------------------------------------------
// pollDeviceToken
// -----------------------------------------------------------------------------

describe("AuthClient.pollDeviceToken", () => {
  it.effect("returns token on immediate success after first poll", () => {
    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
    const layer = makeTestLayer(
      () =>
        new Response(
          JSON.stringify(
            makeTokenResponse({ access_token: "axm_ses_polled", expires_at: expiresAt }),
          ),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );

    return Effect.gen(function* () {
      const client = yield* AuthClient;
      const result = yield* client.pollDeviceToken("dev_123", 0);
      expect(result.access_token).toBe("axm_ses_polled");
    }).pipe(Effect.provide(layer));
  });

  it.effect("continues polling on authorization_pending then succeeds", () => {
    let callCount = 0;
    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

    const layer = makeTestLayer(() => {
      callCount++;
      if (callCount < 3) {
        return new Response(JSON.stringify(makeOAuthError("authorization_pending")), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify(
          makeTokenResponse({ access_token: "axm_ses_after_pending", expires_at: expiresAt }),
        ),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    return Effect.gen(function* () {
      const client = yield* AuthClient;
      const result = yield* client.pollDeviceToken("dev_123", 0);
      expect(result.access_token).toBe("axm_ses_after_pending");
      expect(callCount).toBe(3);
    }).pipe(Effect.provide(layer));
  });

  it.effect("retries transient poll failures before succeeding", () => {
    let callCount = 0;
    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

    const layer = makeTestLayer(() => {
      callCount++;
      if (callCount < 3) {
        return new Response(JSON.stringify(internalErrorResponse), {
          status: 500,
          headers: { "content-type": "application/problem+json" },
        });
      }
      return new Response(
        JSON.stringify(
          makeTokenResponse({ access_token: "axm_ses_after_retry", expires_at: expiresAt }),
        ),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    return Effect.gen(function* () {
      const client = yield* AuthClient;
      // Fork so we can advance the TestClock past the exponential retry
      // backoff (250 ms + 500 ms = 750 ms across two retries).
      const fiber = yield* Effect.forkChild(client.pollDeviceToken("dev_123", 0));
      yield* Effect.yieldNow;
      yield* TestClock.adjust("1 second");
      const result = yield* Fiber.join(fiber);
      expect(result.access_token).toBe("axm_ses_after_retry");
      expect(callCount).toBe(3);
    }).pipe(Effect.provide(layer));
  });

  it.effect("fails after exhausting transient poll retries", () => {
    let callCount = 0;

    const layer = makeTestLayer(() => {
      callCount++;
      return new Response(JSON.stringify(internalErrorResponse), {
        status: 500,
        headers: { "content-type": "application/problem+json" },
      });
    });

    return Effect.gen(function* () {
      const client = yield* AuthClient;
      const fiber = yield* Effect.forkChild(client.pollDeviceToken("dev_123", 0).pipe(Effect.flip));
      yield* Effect.yieldNow;
      yield* TestClock.adjust("1 second");
      const error = asRegistryFailure(yield* Fiber.join(fiber));

      expect(error.category).toBe("internal");
      expect(error.metadata?.response).toMatchObject({
        status: 500,
        body: internalErrorResponse,
      });
      expect(callCount).toBe(3);
    }).pipe(Effect.provide(layer));
  });

  it.effect("does not retry a server response that violates its declared contract", () => {
    let callCount = 0;
    const layer = makeTestLayer(() => {
      callCount++;
      return new Response(JSON.stringify({ message: "internal error" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    });

    return Effect.gen(function* () {
      const client = yield* AuthClient;
      const error = asRegistryFailure(
        yield* client.pollDeviceToken("dev_123", 0).pipe(Effect.flip),
      );
      expect(error.category).toBe("internal");
      expect(error.cause).toMatchObject({ _tag: "SchemaError" });
      expect(callCount).toBe(1);
    }).pipe(Effect.provide(layer));
  });

  it.effect("fails with AUTH_LOGIN_CANCELLED on access_denied", () => {
    const layer = makeTestLayer(
      () =>
        new Response(JSON.stringify(makeOAuthError("access_denied")), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
    );

    return Effect.gen(function* () {
      const client = yield* AuthClient;
      const error = yield* client.pollDeviceToken("dev_123", 0).pipe(Effect.flip);
      expect(error._tag).toBe("DeviceLoginDenied");
    }).pipe(Effect.provide(layer));
  });

  it.effect("fails with AUTH_LOGIN_FAILED on expired_token", () => {
    const layer = makeTestLayer(
      () =>
        new Response(JSON.stringify(makeOAuthError("expired_token")), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
    );

    return Effect.gen(function* () {
      const client = yield* AuthClient;
      const error = yield* client.pollDeviceToken("dev_123", 0).pipe(Effect.flip);
      expect(error._tag).toBe("DeviceLoginCodeExpired");
    }).pipe(Effect.provide(layer));
  });

  it.effect("increases interval on slow_down then succeeds", () => {
    let callCount = 0;
    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

    const layer = makeTestLayer(() => {
      callCount++;
      if (callCount === 1) {
        return new Response(JSON.stringify(makeOAuthError("slow_down")), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify(
          makeTokenResponse({ access_token: "axm_ses_after_slowdown", expires_at: expiresAt }),
        ),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    return Effect.gen(function* () {
      const client = yield* AuthClient;
      // Fork the polling effect so we can advance the TestClock past the
      // slow_down back-off interval (5 000 ms) without waiting real time.
      const fiber = yield* Effect.forkChild(client.pollDeviceToken("dev_123", 0));
      yield* Effect.yieldNow;
      // Advance past the 5 s slow-down increment so the second poll fires.
      yield* TestClock.adjust("6 seconds");
      const result = yield* Fiber.join(fiber);
      expect(result.access_token).toBe("axm_ses_after_slowdown");
      expect(callCount).toBe(2);
    }).pipe(Effect.provide(layer));
  });
});

describe("AuthClient token operations", () => {
  it.effect("revokes a token without a verification header", () => {
    let stepUpRequestHeader: string | undefined;
    const layer = makeTestLayer((request) => {
      expect(request.method).toBe("DELETE");
      stepUpRequestHeader = request.headers["x-axm-step-up-request"];
      return new Response(null, { status: 204 });
    });

    return Effect.gen(function* () {
      const client = yield* AuthClient;
      yield* client.deleteToken("token_123");
      expect(stepUpRequestHeader).toBeUndefined();
    }).pipe(Effect.provide(layer));
  });
});

// -----------------------------------------------------------------------------
// TokenExchange.refreshToken
// -----------------------------------------------------------------------------

describe("TokenExchange.refreshToken", () => {
  const exchangeLayer = (handler: (request: HttpClientRequest.HttpClientRequest) => Response) =>
    Layer.provide(
      TokenExchangeLive,
      Layer.succeed(HttpClient.HttpClient, makeMockHttpClient(handler)),
    );

  it.effect("returns new tokens on success", () => {
    const expiresAt = "2026-03-10T12:30:00.000Z";

    const layer = exchangeLayer((req) => {
      expect(req.url).toContain("/v1/auth/token");
      expect(req.method).toBe("POST");
      return new Response(
        JSON.stringify(
          makeTokenResponse({
            access_token: "axm_ses_refreshed",
            refresh_token: "axm_ref_refreshed",
            expires_at: expiresAt,
            expires_in: 1800,
          }),
        ),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    return Effect.gen(function* () {
      const exchange = yield* TokenExchange;
      const result = yield* exchange.refreshToken("axm_ref_old", REGISTRY_URL);
      expect(result.access_token).toBe("axm_ses_refreshed");
      expect(result.refresh_token).toBe("axm_ref_refreshed");
      expect(DateTime.formatIso(result.expires_at)).toBe(expiresAt);
    }).pipe(Effect.provide(layer));
  });

  it.effect("reports a refused refresh token as the session having ended", () => {
    const layer = exchangeLayer(
      () =>
        new Response(JSON.stringify(makeDecodeError("invalid_grant", 400)), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
    );

    return Effect.gen(function* () {
      const exchange = yield* TokenExchange;
      const error = yield* exchange.refreshToken("axm_ref_expired", REGISTRY_URL).pipe(Effect.flip);
      expect(error._tag).toBe("SessionEnded");
    }).pipe(Effect.provide(layer));
  });

  it.effect("reports the Registry's own authentication refusal as the session having ended", () => {
    const layer = exchangeLayer(
      () =>
        new Response(JSON.stringify(makeRefreshTokenError()), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
    );

    return Effect.gen(function* () {
      const exchange = yield* TokenExchange;
      const error = yield* exchange.refreshToken("axm_ref_expired", REGISTRY_URL).pipe(Effect.flip);
      expect(error._tag).toBe("SessionEnded");
    }).pipe(Effect.provide(layer));
  });

  it.effect("keeps the session when the Registry fails while renewing it", () => {
    const layer = exchangeLayer(() => new Response("unavailable", { status: 503 }));

    return Effect.gen(function* () {
      const exchange = yield* TokenExchange;
      const error = yield* exchange.refreshToken("axm_ref_old", REGISTRY_URL).pipe(Effect.flip);
      expect(error._tag).toBe("RefreshUnavailable");
    }).pipe(Effect.provide(layer));
  });

  it.effect("keeps the session when the Registry cannot be reached", () => {
    const layer = Layer.provide(
      TokenExchangeLive,
      Layer.succeed(HttpClient.HttpClient, makeNetworkErrorHttpClient()),
    );

    return Effect.gen(function* () {
      const exchange = yield* TokenExchange;
      const error = yield* exchange.refreshToken("axm_ref_old", REGISTRY_URL).pipe(Effect.flip);
      expect(error._tag).toBe("RefreshUnavailable");
    }).pipe(Effect.provide(layer));
  });

  // Neither answer speaks for the grant: a rate limit decided nothing about
  // it, and a refusal without the Registry's error document came from
  // something in front of the Registry.
  for (const [name, response] of [
    ["a rate limit", () => new Response("slow down", { status: 429 })],
    [
      "an intermediary's refusal",
      () =>
        new Response("<html>Forbidden</html>", {
          status: 403,
          headers: { "content-type": "text/html" },
        }),
    ],
  ] as const) {
    it.effect(`keeps the session on ${name}`, () =>
      Effect.gen(function* () {
        const exchange = yield* TokenExchange;
        const error = yield* exchange.refreshToken("axm_ref_old", REGISTRY_URL).pipe(Effect.flip);
        expect(error._tag).toBe("RefreshUnavailable");
      }).pipe(Effect.provide(exchangeLayer(response))),
    );
  }

  it.effect("does not blame the network for an accepted grant it cannot read", () => {
    const layer = exchangeLayer(
      () =>
        new Response(JSON.stringify({ access_token: "axm_ses_refreshed" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );

    return Effect.gen(function* () {
      const exchange = yield* TokenExchange;
      const error = yield* exchange.refreshToken("axm_ref_old", REGISTRY_URL).pipe(Effect.flip);
      expect(error._tag).toBe("RegistryAccessFailed");
      expect(error instanceof RegistryAccessFailed ? error.category : null).toBe("internal");
    }).pipe(Effect.provide(layer));
  });
});

// -----------------------------------------------------------------------------
// TokenExchange.revokeToken
// -----------------------------------------------------------------------------

describe("TokenExchange.revokeToken", () => {
  const exchangeLayer = (handler: (request: HttpClientRequest.HttpClientRequest) => Response) =>
    Layer.provide(
      TokenExchangeLive,
      Layer.succeed(HttpClient.HttpClient, makeMockHttpClient(handler)),
    );

  it.effect("succeeds on 200", () => {
    const layer = exchangeLayer((req) => {
      expect(req.url).toContain("/v1/auth/revoke");
      expect(req.method).toBe("POST");
      return new Response("", { status: 200 });
    });

    return Effect.gen(function* () {
      const exchange = yield* TokenExchange;
      yield* exchange.revokeToken("axm_ref_revoke", REGISTRY_URL);
    }).pipe(Effect.provide(layer));
  });

  // The caller decides that sign-out continues without a confirmed revoke, so
  // it has to be told when there was none.
  it.effect("reports a server error", () => {
    const layer = exchangeLayer(() => new Response("internal error", { status: 500 }));

    return Effect.gen(function* () {
      const exchange = yield* TokenExchange;
      const error = yield* exchange.revokeToken("axm_ref_revoke", REGISTRY_URL).pipe(Effect.flip);
      expect(error.category).toBe("internal");
    }).pipe(Effect.provide(layer));
  });

  it.effect("reports an unreachable Registry", () => {
    const layer = Layer.provide(
      TokenExchangeLive,
      Layer.succeed(HttpClient.HttpClient, makeNetworkErrorHttpClient()),
    );

    return Effect.gen(function* () {
      const exchange = yield* TokenExchange;
      const error = yield* exchange.revokeToken("axm_ref_revoke", REGISTRY_URL).pipe(Effect.flip);
      expect(error.category).toBe("network");
    }).pipe(Effect.provide(layer));
  });
});

// -----------------------------------------------------------------------------
// getMe
// -----------------------------------------------------------------------------

describe("AuthClient.getMe", () => {
  it.effect("returns identity on success with MeResponse transform", () => {
    let capturedAuth: string | null = null;

    const layer = makeTestLayer((req) => {
      expect(req.url).toBe("https://registry.agentxm.ai/v1/auth/me");
      const authorization = req.headers["authorization"];
      capturedAuth = typeof authorization === "string" ? authorization : null;
      return new Response(JSON.stringify(makeMeResponse()), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    return Effect.gen(function* () {
      const client = yield* AuthClient;
      const result = yield* client.getMe("axm_ses_test");
      expect(capturedAuth).toBe("Bearer axm_ses_test");
      expect(result.userHandle).toBe("@alice");
      expect(result.tokenType).toBe("session");
      // A session carries the account's whole authority, so it reports no
      // permission level and no restrictions — there is nothing narrower to
      // report.
      expect(result.authority).toBe("account");
      expect(result.permissions).toBeNull();
      expect(result.resourceRestrictions).toBeNull();
      expect(result.expiresAt).not.toBeNull();
      expect(Object.keys(result).sort()).toEqual([
        "approvedAt",
        "authority",
        "expiresAt",
        "permissions",
        "resourceRestrictions",
        "tokenType",
        "userHandle",
      ]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("preserves a declared 401 problem response", () => {
    const layer = makeTestLayer(
      () =>
        new Response(JSON.stringify(makeUnauthorizedError()), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
    );

    return Effect.gen(function* () {
      const client = yield* AuthClient;
      const error = asRegistryFailure(yield* client.getMe("axm_ses_bad").pipe(Effect.flip));
      expect(error.category).toBe("auth");
      expect(error.detail).toBe("Invalid or expired token");
      expect(error.metadata?.response).toMatchObject({
        status: 401,
        problemCode: "unauthorized",
        body: makeUnauthorizedError(),
      });
      expect(error.cause).toMatchObject({ _tag: "AuthGetMe401" });
    }).pipe(Effect.provide(layer));
  });

  it.effect("preserves a declared 400 validation response", () => {
    const layer = makeTestLayer(
      () =>
        new Response(JSON.stringify(makeDecodeError("bad_request", 400)), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
    );

    return Effect.gen(function* () {
      const client = yield* AuthClient;
      const error = asRegistryFailure(yield* client.getMe("axm_ses_bad").pipe(Effect.flip));
      expect(error.category).toBe("validation");
      expect(error.metadata?.response).toMatchObject({
        status: 400,
        problemCode: "bad_request",
        body: makeDecodeError("bad_request", 400),
      });
    }).pipe(Effect.provide(layer));
  });

  it.effect("preserves an undeclared 404 response", () => {
    const layer = makeTestLayer(
      () => new Response(JSON.stringify({ message: "not found" }), { status: 404 }),
    );

    return Effect.gen(function* () {
      const client = yield* AuthClient;
      const error = asRegistryFailure(yield* client.getMe("axm_ses_bad").pipe(Effect.flip));
      expect(error.category).toBe("not_found");
      expect(error.metadata?.response).toMatchObject({
        status: 404,
        body: { message: "not found" },
      });
    }).pipe(Effect.provide(layer));
  });

  it.effect("classifies a transport-only failure as network", () => {
    const httpLayer = Layer.succeed(HttpClient.HttpClient, makeNetworkErrorHttpClient());
    const registryUrlLayer = Layer.succeed(RegistryUrl, REGISTRY_URL);
    const layer = Layer.provide(AuthClientLive, Layer.mergeAll(httpLayer, registryUrlLayer));

    return Effect.gen(function* () {
      const client = yield* AuthClient;
      const error = asRegistryFailure(yield* client.getMe("axm_ses_bad").pipe(Effect.flip));
      expect(error.category).toBe("network");
    }).pipe(Effect.provide(layer));
  });
});
