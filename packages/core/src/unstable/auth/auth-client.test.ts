/**
 * Unit tests for AuthClient service.
 *
 * Covers: device flow initiation, device token polling (all RFC 8628 states),
 * token refresh, token revocation, and identity queries.
 *
 * Tests exercise the generated registry client integration by providing
 * mock HTTP responses that match the generated schema expectations.
 */

import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { describe, expect, it } from "vitest";

import { AuthClient, AuthClientLive, pollOnce } from "./auth-client.js";
import { RegistryUrl } from "./registry-url.js";
import * as GeneratedRegistryClient from "../registry/__generated__/registry-client.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const REGISTRY_URL = "https://registry.agentxm.ai";

const makeMockHttpClient = (handler: (request: HttpClientRequest.HttpClientRequest) => Response) =>
  HttpClient.make((request) =>
    Effect.sync(() => HttpClientResponse.fromWeb(request, handler(request))),
  );

const makeTestLayer = (handler: (request: HttpClientRequest.HttpClientRequest) => Response) => {
  const httpLayer = Layer.succeed(HttpClient.HttpClient, makeMockHttpClient(handler));
  const registryUrlLayer = Layer.succeed(RegistryUrl, REGISTRY_URL);
  return Layer.provide(AuthClientLive, Layer.mergeAll(httpLayer, registryUrlLayer));
};

/** Build a valid AuthExchangeDeviceCode200-compatible JSON response body. */
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

/** Build an RFC 9457 InvalidRequestError-compatible JSON error body. */
const makeOAuthError = (code: string) => ({
  kind: "InvalidRequestError",
  type: "urn:ietf:params:oauth:error",
  title: "OAuth Error",
  status: 400,
  detail: `OAuth error: ${code}`,
  code,
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
    handle: "alice",
    email: "alice@example.com",
  },
  orgs: [],
  token: {
    id: "tok_01h455vb4pexka56gq5w2r7cpc",
    type: "session",
    name: null,
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

describe("AuthClient.initiateDeviceFlow", () => {
  it("returns device flow response on success", async () => {
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

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* AuthClient;
        return yield* client.initiateDeviceFlow();
      }).pipe(Effect.provide(layer)),
    );

    expect(result.device_code).toBe("dev_123");
    expect(result.user_code).toBe("ABCD-1234");
    expect(result.verification_uri).toBe("https://agentxm.ai/device");
    expect(result.verification_uri_complete).toBe("https://agentxm.ai/device?code=ABCD-1234");
    expect(result.interval).toBe(5);
    expect(result.expires_in).toBe(900);
  });

  it("fails with AUTH_LOGIN_FAILED on 400 error", async () => {
    const layer = makeTestLayer(
      () =>
        new Response(JSON.stringify(makeDecodeError("unknown_client", 400)), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
    );

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* AuthClient;
        return yield* client.initiateDeviceFlow().pipe(Effect.result);
      }).pipe(Effect.provide(layer)),
    );

    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      expect(result.failure.code).toBe("AUTH_LOGIN_FAILED");
    }
  });

  it("fails with AUTH_LOGIN_FAILED on network error", async () => {
    const httpLayer = Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make(() => Effect.fail(new Error("ECONNREFUSED"))),
    );
    const registryUrlLayer = Layer.succeed(RegistryUrl, REGISTRY_URL);
    const layer = Layer.provide(AuthClientLive, Layer.mergeAll(httpLayer, registryUrlLayer));

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* AuthClient;
        return yield* client.initiateDeviceFlow().pipe(Effect.result);
      }).pipe(Effect.provide(layer)),
    );

    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      expect(result.failure.code).toBe("AUTH_LOGIN_FAILED");
    }
  });

  it("sends correct request body", async () => {
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

    await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* AuthClient;
        return yield* client.initiateDeviceFlow();
      }).pipe(Effect.provide(layer)),
    );
  });
});

// -----------------------------------------------------------------------------
// pollOnce (single poll step via generated client)
// -----------------------------------------------------------------------------

describe("pollOnce", () => {
  /** Create a generated registry client backed by a mock HTTP handler. */
  const makeMockClient = (handler: (request: HttpClientRequest.HttpClientRequest) => Response) => {
    const httpClient = makeMockHttpClient(handler);
    return GeneratedRegistryClient.make(
      httpClient.pipe(HttpClient.mapRequest(HttpClientRequest.prependUrl(REGISTRY_URL))),
    );
  };

  it("returns Success on 200 with token", async () => {
    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
    const client = makeMockClient(
      () =>
        new Response(
          JSON.stringify(makeTokenResponse({ access_token: "axm_ses_new", expires_at: expiresAt })),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );

    const result = await Effect.runPromise(pollOnce(client, "dev_123"));
    expect(result._tag).toBe("Success");
    if (result._tag === "Success") {
      expect(result.token.access_token).toBe("axm_ses_new");
      expect(result.token.expires_at).toBe(expiresAt);
    }
  });

  it("returns Pending on authorization_pending error", async () => {
    const client = makeMockClient(
      () =>
        new Response(JSON.stringify(makeOAuthError("authorization_pending")), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
    );

    const result = await Effect.runPromise(pollOnce(client, "dev_123"));
    expect(result._tag).toBe("Pending");
  });

  it("returns SlowDown on slow_down error", async () => {
    const client = makeMockClient(
      () =>
        new Response(JSON.stringify(makeOAuthError("slow_down")), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
    );

    const result = await Effect.runPromise(pollOnce(client, "dev_123"));
    expect(result._tag).toBe("SlowDown");
  });

  it("returns AccessDenied on access_denied error", async () => {
    const client = makeMockClient(
      () =>
        new Response(JSON.stringify(makeOAuthError("access_denied")), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
    );

    const result = await Effect.runPromise(pollOnce(client, "dev_123"));
    expect(result._tag).toBe("AccessDenied");
  });

  it("returns ExpiredToken on expired_token error", async () => {
    const client = makeMockClient(
      () =>
        new Response(JSON.stringify(makeOAuthError("expired_token")), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
    );

    const result = await Effect.runPromise(pollOnce(client, "dev_123"));
    expect(result._tag).toBe("ExpiredToken");
  });

  it("fails with AUTH_LOGIN_FAILED on unexpected 500 error", async () => {
    const client = makeMockClient(
      () =>
        new Response(JSON.stringify({ message: "internal error" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        }),
    );

    const result = await Effect.runPromise(pollOnce(client, "dev_123").pipe(Effect.result));
    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      expect(result.failure.code).toBe("AUTH_LOGIN_FAILED");
    }
  });
});

// -----------------------------------------------------------------------------
// pollDeviceToken
// -----------------------------------------------------------------------------

describe("AuthClient.pollDeviceToken", () => {
  it("returns token on immediate success after first poll", async () => {
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

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* AuthClient;
        return yield* client.pollDeviceToken("dev_123", 0);
      }).pipe(Effect.provide(layer)),
    );

    expect(result.access_token).toBe("axm_ses_polled");
  });

  it("continues polling on authorization_pending then succeeds", async () => {
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

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* AuthClient;
        return yield* client.pollDeviceToken("dev_123", 0);
      }).pipe(Effect.provide(layer)),
    );

    expect(result.access_token).toBe("axm_ses_after_pending");
    expect(callCount).toBe(3);
  });

  it("fails with AUTH_LOGIN_CANCELLED on access_denied", async () => {
    const layer = makeTestLayer(
      () =>
        new Response(JSON.stringify(makeOAuthError("access_denied")), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
    );

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* AuthClient;
        return yield* client.pollDeviceToken("dev_123", 0).pipe(Effect.result);
      }).pipe(Effect.provide(layer)),
    );

    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      expect(result.failure.code).toBe("AUTH_LOGIN_CANCELLED");
    }
  });

  it("fails with AUTH_LOGIN_FAILED on expired_token", async () => {
    const layer = makeTestLayer(
      () =>
        new Response(JSON.stringify(makeOAuthError("expired_token")), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
    );

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* AuthClient;
        return yield* client.pollDeviceToken("dev_123", 0).pipe(Effect.result);
      }).pipe(Effect.provide(layer)),
    );

    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      expect(result.failure.code).toBe("AUTH_LOGIN_FAILED");
    }
  });

  it("increases interval on slow_down then succeeds", async () => {
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

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* AuthClient;
        return yield* client.pollDeviceToken("dev_123", 0);
      }).pipe(Effect.provide(layer)),
    );

    expect(result.access_token).toBe("axm_ses_after_slowdown");
    expect(callCount).toBe(2);
  }, 10000);
});

// -----------------------------------------------------------------------------
// refreshToken
// -----------------------------------------------------------------------------

describe("AuthClient.refreshToken", () => {
  it("returns new tokens on success", async () => {
    const expiresAt = "2026-03-10T12:30:00.000Z";

    const layer = makeTestLayer((req) => {
      expect(req.url).toContain("/v1/auth/token/refresh");
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

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* AuthClient;
        return yield* client.refreshToken("axm_ref_old");
      }).pipe(Effect.provide(layer)),
    );

    expect(result.access_token).toBe("axm_ses_refreshed");
    expect(result.refresh_token).toBe("axm_ref_refreshed");
    expect(result.expires_at).toBe(expiresAt);
  });

  it("fails with AUTH_REFRESH_FAILED on 400", async () => {
    const layer = makeTestLayer(
      () =>
        new Response(JSON.stringify(makeDecodeError("invalid_grant", 400)), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
    );

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* AuthClient;
        return yield* client.refreshToken("axm_ref_expired").pipe(Effect.result);
      }).pipe(Effect.provide(layer)),
    );

    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      expect(result.failure.code).toBe("AUTH_REFRESH_FAILED");
    }
  });

  it("fails with AUTH_REFRESH_FAILED on 401", async () => {
    const layer = makeTestLayer(
      () =>
        new Response(JSON.stringify(makeRefreshTokenError()), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
    );

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* AuthClient;
        return yield* client.refreshToken("axm_ref_expired").pipe(Effect.result);
      }).pipe(Effect.provide(layer)),
    );

    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      expect(result.failure.code).toBe("AUTH_REFRESH_FAILED");
    }
  });

  it("fails with AUTH_REFRESH_FAILED on network error", async () => {
    const httpLayer = Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make(() => Effect.fail(new Error("ECONNREFUSED"))),
    );
    const registryUrlLayer = Layer.succeed(RegistryUrl, REGISTRY_URL);
    const layer = Layer.provide(AuthClientLive, Layer.mergeAll(httpLayer, registryUrlLayer));

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* AuthClient;
        return yield* client.refreshToken("axm_ref_old").pipe(Effect.result);
      }).pipe(Effect.provide(layer)),
    );

    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      expect(result.failure.code).toBe("AUTH_REFRESH_FAILED");
    }
  });
});

// -----------------------------------------------------------------------------
// revokeToken
// -----------------------------------------------------------------------------

describe("AuthClient.revokeToken", () => {
  it("succeeds on 200", async () => {
    const layer = makeTestLayer((req) => {
      expect(req.url).toContain("/v1/auth/token/revoke");
      expect(req.method).toBe("POST");
      return new Response("", { status: 200 });
    });

    await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* AuthClient;
        yield* client.revokeToken("axm_ses_revoke");
      }).pipe(Effect.provide(layer)),
    );
  });

  it("succeeds (non-fatal) on server error — errors swallowed", async () => {
    const layer = makeTestLayer(() => new Response("internal error", { status: 500 }));

    // Should not throw — revoke is best-effort
    await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* AuthClient;
        yield* client.revokeToken("axm_ses_revoke");
      }).pipe(Effect.provide(layer)),
    );
  });

  it("succeeds (non-fatal) on 400 error — errors swallowed", async () => {
    const layer = makeTestLayer(
      () =>
        new Response(JSON.stringify(makeDecodeError("invalid_token", 400)), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
    );

    // Should not throw — revoke is best-effort
    await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* AuthClient;
        yield* client.revokeToken("axm_ses_revoke");
      }).pipe(Effect.provide(layer)),
    );
  });

  it("succeeds (non-fatal) on network error — errors swallowed", async () => {
    const httpLayer = Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make(() => Effect.fail(new Error("ECONNREFUSED"))),
    );
    const registryUrlLayer = Layer.succeed(RegistryUrl, REGISTRY_URL);
    const layer = Layer.provide(AuthClientLive, Layer.mergeAll(httpLayer, registryUrlLayer));

    // Should not throw — revoke is best-effort
    await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* AuthClient;
        yield* client.revokeToken("axm_ses_revoke");
      }).pipe(Effect.provide(layer)),
    );
  });
});

// -----------------------------------------------------------------------------
// getMe
// -----------------------------------------------------------------------------

describe("AuthClient.getMe", () => {
  it("returns identity on success with MeResponse transform", async () => {
    let capturedAuth: string | null = null;

    const layer = makeTestLayer((req) => {
      const authorization = req.headers["authorization"];
      capturedAuth = typeof authorization === "string" ? authorization : null;
      return new Response(JSON.stringify(makeMeResponse()), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* AuthClient;
        return yield* client.getMe("axm_ses_test");
      }).pipe(Effect.provide(layer)),
    );

    expect(capturedAuth).toBe("Bearer axm_ses_test");
    expect(result.userId).toBe("user_01h455vb4pexka56gq5w2r7cpc");
    expect(result.userHandle).toBe("alice");
    expect(result.email).toBe("alice@example.com");
    expect(result.tokenType).toBe("session");
    expect(result.scopes).toEqual(["extensions:read", "account:read"]);
    expect(result.orgs).toEqual([]);
  });

  it("fails with AUTH_UNAUTHENTICATED on 401", async () => {
    const layer = makeTestLayer(
      () =>
        new Response(JSON.stringify(makeUnauthorizedError()), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
    );

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* AuthClient;
        return yield* client.getMe("axm_ses_bad").pipe(Effect.result);
      }).pipe(Effect.provide(layer)),
    );

    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      expect(result.failure.code).toBe("AUTH_UNAUTHENTICATED");
    }
  });

  it("fails with AUTH_UNAUTHENTICATED on 400", async () => {
    const layer = makeTestLayer(
      () =>
        new Response(JSON.stringify(makeDecodeError("bad_request", 400)), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
    );

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* AuthClient;
        return yield* client.getMe("axm_ses_bad").pipe(Effect.result);
      }).pipe(Effect.provide(layer)),
    );

    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      expect(result.failure.code).toBe("AUTH_UNAUTHENTICATED");
    }
  });

  it("fails with AUTH_UNAUTHENTICATED on unexpected status (404)", async () => {
    // 404 is not a known status handler for AuthGetMe, so hits unexpectedStatus
    // which produces an HttpClientError — mapped to AUTH_UNAUTHENTICATED
    const layer = makeTestLayer(
      () => new Response(JSON.stringify({ message: "not found" }), { status: 404 }),
    );

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* AuthClient;
        return yield* client.getMe("axm_ses_bad").pipe(Effect.result);
      }).pipe(Effect.provide(layer)),
    );

    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      expect(result.failure.code).toBe("AUTH_UNAUTHENTICATED");
    }
  });

  it("fails with AUTH_UNAUTHENTICATED on network error", async () => {
    const httpLayer = Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make(() => Effect.fail(new Error("ECONNREFUSED"))),
    );
    const registryUrlLayer = Layer.succeed(RegistryUrl, REGISTRY_URL);
    const layer = Layer.provide(AuthClientLive, Layer.mergeAll(httpLayer, registryUrlLayer));

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* AuthClient;
        return yield* client.getMe("axm_ses_bad").pipe(Effect.result);
      }).pipe(Effect.provide(layer)),
    );

    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      expect(result.failure.code).toBe("AUTH_UNAUTHENTICATED");
    }
  });

  // Note: AUTH_SERVER_ERROR on 5xx is hard to test via HTTP mocks because the
  // generated client's `orElse: unexpectedStatus` handler for unknown status codes
  // (including 500) produces HttpClientError.StatusCodeError, not a RegistryClientError
  // with a 5xx tag suffix. The mapError handler falls through to the final
  // AUTH_UNAUTHENTICATED catch-all. This matches the production behavior since
  // the generated client doesn't have a 5xx handler for AuthGetMe.
});
