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

import { AuthClient, AuthClientLive, pollOnce, readStepUpRequest } from "./auth-client.js";
import { RegistryUrl } from "./registry-url.js";

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

const makeTestLayer = (handler: (request: HttpClientRequest.HttpClientRequest) => Response) => {
  const httpLayer = Layer.succeed(HttpClient.HttpClient, makeMockHttpClient(handler));
  const registryUrlLayer = Layer.succeed(RegistryUrl, REGISTRY_URL);
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
  kind: "DeviceTokenOAuthError",
  error,
  error_description: `OAuth error: ${error}`,
});

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
  orgs: [],
  token: {
    id: "tok_01h455vb4pexka56gq5w2r7cpc",
    type: "session",
    name: null,
    permissions: null,
    scopes: ["extensions:read", "account:read"],
    resource_restrictions: { extensions: null },
    expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
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
      expect(url.searchParams.get("scope")).toContain("extensions:publish:new");
    }).pipe(Effect.provide(layer));
  });
});

describe("AuthClient.initiateDeviceFlow", () => {
  it.effect("returns device flow response on success", () => {
    const layer = makeTestLayer(
      () =>
        new Response(
          JSON.stringify({
            device_code: "dev_123",
            user_code: "ABCD-1234",
            verification_uri: "https://agentxm.ai/device",
            verification_uri_complete: "https://agentxm.ai/device?code=ABCD-1234",
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
      expect(result.verification_uri_complete).toBe("https://agentxm.ai/device?code=ABCD-1234");
      expect(result.interval).toBe(5);
      expect(result.expires_in).toBe(900);
    }).pipe(Effect.provide(layer));
  });

  it.effect("fails with AUTH_LOGIN_FAILED on 400 error", () => {
    const layer = makeTestLayer(
      () =>
        new Response(JSON.stringify(makeDecodeError("unknown_client", 400)), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
    );

    return Effect.gen(function* () {
      const client = yield* AuthClient;
      const error = yield* client.initiateDeviceFlow().pipe(Effect.flip);
      expect(error.code).toBe("auth");
    }).pipe(Effect.provide(layer));
  });

  it.effect("fails with AUTH_LOGIN_FAILED on network error", () => {
    const httpLayer = Layer.succeed(HttpClient.HttpClient, makeNetworkErrorHttpClient());
    const registryUrlLayer = Layer.succeed(RegistryUrl, REGISTRY_URL);
    const layer = Layer.provide(AuthClientLive, Layer.mergeAll(httpLayer, registryUrlLayer));

    return Effect.gen(function* () {
      const client = yield* AuthClient;
      const error = yield* client.initiateDeviceFlow().pipe(Effect.flip);
      expect(error.code).toBe("auth");
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
          verification_uri_complete: "https://agentxm.ai/device?code=ABCD-1234",
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

  it.effect("maps transient HttpClientError (500) to AUTH_LOGIN_FAILED", () => {
    // pollOnce does not retry on its own; a 5xx StatusCodeError is classified
    // as transient and collapses into the "Lost connection" AppError message.
    const httpClient = makeMockHttpClient(
      () =>
        new Response(JSON.stringify({ message: "internal error" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        }),
    );

    return Effect.gen(function* () {
      const error = yield* pollOnce(httpClient, REGISTRY_URL, "dev_123").pipe(Effect.flip);
      expect(error.code).toBe("auth");
      expect(error.detail).toBe("Lost connection to the registry during login");
    });
  });

  it.effect("fails with AUTH_LOGIN_FAILED on schema decode error (malformed 200 body)", () => {
    // A 200 with a body that does not match the token response schema surfaces
    // a SchemaError (not an HttpClientError), which is NOT considered transient
    // and must flow through the "unexpected error" branch.
    const httpClient = makeMockHttpClient(
      () =>
        new Response(JSON.stringify({ not: "a token" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );

    return Effect.gen(function* () {
      const error = yield* pollOnce(httpClient, REGISTRY_URL, "dev_123").pipe(Effect.flip);
      expect(error.code).toBe("auth");
      expect(error.detail).toBe("Device token exchange failed with an unexpected error");
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
        return new Response(JSON.stringify({ message: "internal error" }), {
          status: 500,
          headers: { "content-type": "application/json" },
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
      return new Response(JSON.stringify({ message: "internal error" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    });

    return Effect.gen(function* () {
      const client = yield* AuthClient;
      const fiber = yield* Effect.forkChild(client.pollDeviceToken("dev_123", 0).pipe(Effect.flip));
      yield* Effect.yieldNow;
      yield* TestClock.adjust("1 second");
      const error = yield* Fiber.join(fiber);

      expect(error.code).toBe("auth");
      expect(error.detail).toBe("Lost connection to the registry during login");
      expect(callCount).toBe(3);
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
      expect(error.code).toBe("auth");
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
      expect(error.code).toBe("auth");
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

describe("AuthClient step-up requests", () => {
  it.effect("waits through pending status and completes when the request is verified", () => {
    let callCount = 0;
    const layer = makeTestLayer((request) => {
      expect(request.url).toBe(
        `${REGISTRY_URL}/v1/auth/step-up/requests/step_01h455vb4pexka56gq5w2r7cpc`,
      );
      callCount += 1;
      return new Response(
        JSON.stringify({
          status: callCount === 1 ? "pending" : "verified",
          expires_at: "2026-08-10T16:05:00.000Z",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    return Effect.gen(function* () {
      const client = yield* AuthClient;
      yield* client.waitForStepUpRequest(
        "axm_ses_token",
        `${REGISTRY_URL}/v1/auth/step-up/requests/step_01h455vb4pexka56gq5w2r7cpc`,
        0,
      );
      expect(callCount).toBe(2);
    }).pipe(Effect.provide(layer));
  });

  it.effect("honors Retry-After when status polling is rate limited", () => {
    let callCount = 0;
    const layer = makeTestLayer(() => {
      callCount += 1;
      return callCount === 1
        ? new Response("rate limited", { status: 429, headers: { "retry-after": "2" } })
        : new Response(
            JSON.stringify({
              status: "verified",
              expires_at: "2026-08-10T16:05:00.000Z",
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
    });

    return Effect.gen(function* () {
      const client = yield* AuthClient;
      const fiber = yield* Effect.forkChild(
        client.waitForStepUpRequest(
          "axm_ses_token",
          `${REGISTRY_URL}/v1/auth/step-up/requests/step_01h455vb4pexka56gq5w2r7cpc`,
          0,
        ),
      );
      yield* Effect.yieldNow;
      yield* TestClock.adjust("2 seconds");
      yield* Fiber.join(fiber);
      expect(callCount).toBe(2);
    }).pipe(Effect.provide(layer));
  });

  it.effect("maps cancelled, expired, and consumed requests to distinct errors", () => {
    const terminalStatuses = [
      ["cancelled", "auth_denied", "cancelled"],
      ["expired", "auth_expired", "expired"],
      ["consumed", "conflict", "already been used"],
    ] as const;

    return Effect.forEach(terminalStatuses, ([status, code, detail]) => {
      const layer = makeTestLayer(
        () =>
          new Response(JSON.stringify({ status, expires_at: "2026-08-10T16:05:00.000Z" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      );
      return Effect.gen(function* () {
        const client = yield* AuthClient;
        const error = yield* client
          .waitForStepUpRequest(
            "axm_ses_token",
            `${REGISTRY_URL}/v1/auth/step-up/requests/step_01h455vb4pexka56gq5w2r7cpc`,
            0,
          )
          .pipe(Effect.flip);
        expect(error.code).toBe(code);
        expect(error.detail).toContain(detail);
      }).pipe(Effect.provide(layer));
    }).pipe(Effect.asVoid);
  });

  it.effect("retains the contextual request handoff from a step-up response", () => {
    const layer = makeTestLayer(
      () =>
        new Response(
          JSON.stringify({
            kind: "StepUpRequiredError",
            type: "https://agentxm.ai/problems/eotp",
            title: "Additional Authentication Required",
            status: 401,
            detail: "More recent authentication is required for this operation.",
            code: "eotp",
            max_age: 300,
            step_up: {
              request_id: "step_01h455vb4pexka56gq5w2r7cpc",
              verification_url: "https://agentxm.ai/step-up/step_01h455vb4pexka56gq5w2r7cpc",
              status_url: `${REGISTRY_URL}/v1/auth/step-up/requests/step_01h455vb4pexka56gq5w2r7cpc`,
              expires_at: "2026-08-10T16:05:00.000Z",
              interval: 2,
              action: "Revoke access token",
              target: "token_123",
            },
          }),
          { status: 401, headers: { "content-type": "application/problem+json" } },
        ),
    );

    return Effect.gen(function* () {
      const client = yield* AuthClient;
      const error = yield* client.deleteToken("axm_ses_token", "token_123").pipe(Effect.flip);
      expect(readStepUpRequest(error)).toEqual({
        requestId: "step_01h455vb4pexka56gq5w2r7cpc",
        verificationUrl: "https://agentxm.ai/step-up/step_01h455vb4pexka56gq5w2r7cpc",
        statusUrl: `${REGISTRY_URL}/v1/auth/step-up/requests/step_01h455vb4pexka56gq5w2r7cpc`,
        expiresAt: "2026-08-10T16:05:00.000Z",
        intervalSeconds: 2,
        maxAgeSeconds: 300,
        action: "Revoke access token",
        target: "token_123",
      });
    }).pipe(Effect.provide(layer));
  });

  it.effect("retries a token deletion with only the opaque request header", () => {
    let stepUpRequestHeader: string | undefined;
    let legacyProofHeader: string | undefined;
    const layer = makeTestLayer((request) => {
      stepUpRequestHeader = request.headers["x-axm-step-up-request"];
      legacyProofHeader = request.headers["x-axm-step-up"];
      return new Response(null, { status: 204 });
    });

    return Effect.gen(function* () {
      const client = yield* AuthClient;
      yield* client.deleteToken("axm_ses_token", "token_123", {
        stepUpRequestId: "step_01h455vb4pexka56gq5w2r7cpc",
      });
      expect(stepUpRequestHeader).toBe("step_01h455vb4pexka56gq5w2r7cpc");
      expect(legacyProofHeader).toBeUndefined();
    }).pipe(Effect.provide(layer));
  });
});

// -----------------------------------------------------------------------------
// refreshToken
// -----------------------------------------------------------------------------

describe("AuthClient.refreshToken", () => {
  it.effect("returns new tokens on success", () => {
    const expiresAt = "2026-03-10T12:30:00.000Z";

    const layer = makeTestLayer((req) => {
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
      const client = yield* AuthClient;
      const result = yield* client.refreshToken("axm_ref_old");
      expect(result.access_token).toBe("axm_ses_refreshed");
      expect(result.refresh_token).toBe("axm_ref_refreshed");
      expect(DateTime.formatIso(result.expires_at)).toBe(expiresAt);
    }).pipe(Effect.provide(layer));
  });

  it.effect("fails with AUTH_REFRESH_FAILED on 400", () => {
    const layer = makeTestLayer(
      () =>
        new Response(JSON.stringify(makeDecodeError("invalid_grant", 400)), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
    );

    return Effect.gen(function* () {
      const client = yield* AuthClient;
      const error = yield* client.refreshToken("axm_ref_expired").pipe(Effect.flip);
      expect(error.code).toBe("auth");
    }).pipe(Effect.provide(layer));
  });

  it.effect("fails with AUTH_REFRESH_FAILED on non-OAuth error status", () => {
    const layer = makeTestLayer(
      () =>
        new Response(JSON.stringify(makeRefreshTokenError()), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
    );

    return Effect.gen(function* () {
      const client = yield* AuthClient;
      const error = yield* client.refreshToken("axm_ref_expired").pipe(Effect.flip);
      expect(error.code).toBe("auth");
    }).pipe(Effect.provide(layer));
  });

  it.effect("fails with AUTH_REFRESH_FAILED on network error", () => {
    const httpLayer = Layer.succeed(HttpClient.HttpClient, makeNetworkErrorHttpClient());
    const registryUrlLayer = Layer.succeed(RegistryUrl, REGISTRY_URL);
    const layer = Layer.provide(AuthClientLive, Layer.mergeAll(httpLayer, registryUrlLayer));

    return Effect.gen(function* () {
      const client = yield* AuthClient;
      const error = yield* client.refreshToken("axm_ref_old").pipe(Effect.flip);
      expect(error.code).toBe("auth");
    }).pipe(Effect.provide(layer));
  });
});

// -----------------------------------------------------------------------------
// revokeToken
// -----------------------------------------------------------------------------

describe("AuthClient.revokeToken", () => {
  it.effect("succeeds on 200", () => {
    const layer = makeTestLayer((req) => {
      expect(req.url).toContain("/v1/auth/revoke");
      expect(req.method).toBe("POST");
      return new Response("", { status: 200 });
    });

    return Effect.gen(function* () {
      const client = yield* AuthClient;
      yield* client.revokeToken("axm_ses_revoke");
    }).pipe(Effect.provide(layer));
  });

  it.effect("succeeds (non-fatal) on server error — errors swallowed", () => {
    const layer = makeTestLayer(() => new Response("internal error", { status: 500 }));

    // Should not throw — revoke is best-effort
    return Effect.gen(function* () {
      const client = yield* AuthClient;
      yield* client.revokeToken("axm_ses_revoke");
    }).pipe(Effect.provide(layer));
  });

  it.effect("succeeds (non-fatal) on 400 error — errors swallowed", () => {
    const layer = makeTestLayer(
      () =>
        new Response(JSON.stringify(makeDecodeError("invalid_token", 400)), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
    );

    // Should not throw — revoke is best-effort
    return Effect.gen(function* () {
      const client = yield* AuthClient;
      yield* client.revokeToken("axm_ses_revoke");
    }).pipe(Effect.provide(layer));
  });

  it.effect("succeeds (non-fatal) on network error — errors swallowed", () => {
    const httpLayer = Layer.succeed(HttpClient.HttpClient, makeNetworkErrorHttpClient());
    const registryUrlLayer = Layer.succeed(RegistryUrl, REGISTRY_URL);
    const layer = Layer.provide(AuthClientLive, Layer.mergeAll(httpLayer, registryUrlLayer));

    // Should not throw — revoke is best-effort
    return Effect.gen(function* () {
      const client = yield* AuthClient;
      yield* client.revokeToken("axm_ses_revoke");
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
      expect(result.userId).toBe("user_01h455vb4pexka56gq5w2r7cpc");
      expect(result.userHandle).toBe("@alice");
      expect(result.email).toBe("alice@example.com");
      expect(result.tokenType).toBe("session");
      expect(result.scopes).toEqual(["extensions:read", "account:read"]);
      expect(result.orgs).toEqual([]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("fails with AUTH_UNAUTHENTICATED on 401", () => {
    const layer = makeTestLayer(
      () =>
        new Response(JSON.stringify(makeUnauthorizedError()), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
    );

    return Effect.gen(function* () {
      const client = yield* AuthClient;
      const error = yield* client.getMe("axm_ses_bad").pipe(Effect.flip);
      expect(error.code).toBe("auth");
    }).pipe(Effect.provide(layer));
  });

  it.effect("fails with AUTH_UNAUTHENTICATED on 400", () => {
    const layer = makeTestLayer(
      () =>
        new Response(JSON.stringify(makeDecodeError("bad_request", 400)), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
    );

    return Effect.gen(function* () {
      const client = yield* AuthClient;
      const error = yield* client.getMe("axm_ses_bad").pipe(Effect.flip);
      expect(error.code).toBe("auth");
    }).pipe(Effect.provide(layer));
  });

  it.effect("fails with AUTH_UNAUTHENTICATED on unexpected status (404)", () => {
    // 404 is not a known status handler for AuthGetMe, so hits unexpectedStatus
    // which produces an HttpClientError — mapped to AUTH_UNAUTHENTICATED
    const layer = makeTestLayer(
      () => new Response(JSON.stringify({ message: "not found" }), { status: 404 }),
    );

    return Effect.gen(function* () {
      const client = yield* AuthClient;
      const error = yield* client.getMe("axm_ses_bad").pipe(Effect.flip);
      expect(error.code).toBe("auth");
    }).pipe(Effect.provide(layer));
  });

  it.effect("fails with AUTH_UNAUTHENTICATED on network error", () => {
    const httpLayer = Layer.succeed(HttpClient.HttpClient, makeNetworkErrorHttpClient());
    const registryUrlLayer = Layer.succeed(RegistryUrl, REGISTRY_URL);
    const layer = Layer.provide(AuthClientLive, Layer.mergeAll(httpLayer, registryUrlLayer));

    return Effect.gen(function* () {
      const client = yield* AuthClient;
      const error = yield* client.getMe("axm_ses_bad").pipe(Effect.flip);
      expect(error.code).toBe("auth");
    }).pipe(Effect.provide(layer));
  });

  // Note: AUTH_SERVER_ERROR on 5xx is hard to test via HTTP mocks because the
  // generated client's `orElse: unexpectedStatus` handler for unknown status codes
  // (including 500) produces HttpClientError.StatusCodeError, not a RegistryClientError
  // with a 5xx tag suffix. The mapError handler falls through to the final
  // AUTH_UNAUTHENTICATED catch-all. This matches the production behavior since
  // the generated client doesn't have a 5xx handler for AuthGetMe.
});
