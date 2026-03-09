/**
 * Unit tests for AuthClient service.
 *
 * Covers: device flow initiation, device token polling (all RFC 8628 states),
 * token refresh, token revocation, and identity queries.
 */

import * as HttpClient from "@effect/platform/HttpClient";
import * as HttpClientRequest from "@effect/platform/HttpClientRequest";
import * as HttpClientResponse from "@effect/platform/HttpClientResponse";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { describe, expect, it } from "vitest";

import { AuthClient, AuthClientLive, pollOnce } from "./auth-client.js";

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
  return Layer.provide(AuthClientLive, httpLayer);
};

const futureExpiry = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();

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
            interval: 5,
            expires_in: 900,
          }),
          { status: 200 },
        ),
    );

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* AuthClient;
        return yield* client.initiateDeviceFlow(REGISTRY_URL);
      }).pipe(Effect.provide(layer)),
    );

    expect(result.device_code).toBe("dev_123");
    expect(result.user_code).toBe("ABCD-1234");
    expect(result.verification_uri).toBe("https://agentxm.ai/device");
    expect(result.interval).toBe(5);
    expect(result.expires_in).toBe(900);
  });

  it("fails with AUTH_LOGIN_FAILED on non-200 status", async () => {
    const layer = makeTestLayer(
      () => new Response(JSON.stringify({ error: "unknown_client" }), { status: 400 }),
    );

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* AuthClient;
        return yield* client.initiateDeviceFlow(REGISTRY_URL).pipe(Effect.either);
      }).pipe(Effect.provide(layer)),
    );

    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left.code).toBe("AUTH_LOGIN_FAILED");
    }
  });

  it("sends correct request body", async () => {
    const layer = makeTestLayer((req) => {
      // The body is set via bodyJson — we check the URL and method
      expect(req.url).toContain("/v1/auth/device/code");
      expect(req.method).toBe("POST");
      return new Response(
        JSON.stringify({
          device_code: "dev_123",
          user_code: "ABCD-1234",
          verification_uri: "https://agentxm.ai/device",
          interval: 5,
          expires_in: 900,
        }),
        { status: 200 },
      );
    });

    await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* AuthClient;
        return yield* client.initiateDeviceFlow(REGISTRY_URL);
      }).pipe(Effect.provide(layer)),
    );
  });
});

// -----------------------------------------------------------------------------
// pollOnce (single poll step)
// -----------------------------------------------------------------------------

describe("pollOnce", () => {
  it("returns Success on 200 with token", async () => {
    const httpClient = makeMockHttpClient(
      () =>
        new Response(
          JSON.stringify({
            access_token: "axm_ses_new",
            refresh_token: "axm_ref_new",
            expires_at: futureExpiry(),
          }),
          { status: 200 },
        ),
    );

    const result = await Effect.runPromise(pollOnce(httpClient, REGISTRY_URL, "dev_123"));
    expect(result._tag).toBe("Success");
    if (result._tag === "Success") {
      expect(result.token.access_token).toBe("axm_ses_new");
    }
  });

  it("returns Pending on authorization_pending error", async () => {
    const httpClient = makeMockHttpClient(
      () => new Response(JSON.stringify({ error: "authorization_pending" }), { status: 400 }),
    );

    const result = await Effect.runPromise(pollOnce(httpClient, REGISTRY_URL, "dev_123"));
    expect(result._tag).toBe("Pending");
  });

  it("returns SlowDown on slow_down error", async () => {
    const httpClient = makeMockHttpClient(
      () => new Response(JSON.stringify({ error: "slow_down" }), { status: 400 }),
    );

    const result = await Effect.runPromise(pollOnce(httpClient, REGISTRY_URL, "dev_123"));
    expect(result._tag).toBe("SlowDown");
  });

  it("returns AccessDenied on access_denied error", async () => {
    const httpClient = makeMockHttpClient(
      () => new Response(JSON.stringify({ error: "access_denied" }), { status: 400 }),
    );

    const result = await Effect.runPromise(pollOnce(httpClient, REGISTRY_URL, "dev_123"));
    expect(result._tag).toBe("AccessDenied");
  });

  it("returns ExpiredToken on expired_token error", async () => {
    const httpClient = makeMockHttpClient(
      () => new Response(JSON.stringify({ error: "expired_token" }), { status: 400 }),
    );

    const result = await Effect.runPromise(pollOnce(httpClient, REGISTRY_URL, "dev_123"));
    expect(result._tag).toBe("ExpiredToken");
  });

  it("fails with CliError on unknown error response", async () => {
    const httpClient = makeMockHttpClient(
      () => new Response(JSON.stringify({ error: "server_error" }), { status: 500 }),
    );

    const result = await Effect.runPromise(
      pollOnce(httpClient, REGISTRY_URL, "dev_123").pipe(Effect.either),
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left.code).toBe("AUTH_LOGIN_FAILED");
    }
  });
});

// -----------------------------------------------------------------------------
// pollDeviceToken
// -----------------------------------------------------------------------------

describe("AuthClient.pollDeviceToken", () => {
  it("returns token on immediate success after first poll", async () => {
    const layer = makeTestLayer(
      () =>
        new Response(
          JSON.stringify({
            access_token: "axm_ses_polled",
            refresh_token: "axm_ref_polled",
            expires_at: futureExpiry(),
          }),
          { status: 200 },
        ),
    );

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* AuthClient;
        return yield* client.pollDeviceToken(REGISTRY_URL, "dev_123", 0);
      }).pipe(Effect.provide(layer)),
    );

    expect(result.access_token).toBe("axm_ses_polled");
  });

  it("continues polling on authorization_pending then succeeds", async () => {
    let callCount = 0;

    const layer = makeTestLayer(() => {
      callCount++;
      if (callCount < 3) {
        return new Response(JSON.stringify({ error: "authorization_pending" }), { status: 400 });
      }
      return new Response(
        JSON.stringify({
          access_token: "axm_ses_after_pending",
          refresh_token: "axm_ref_after_pending",
          expires_at: futureExpiry(),
        }),
        { status: 200 },
      );
    });

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* AuthClient;
        return yield* client.pollDeviceToken(REGISTRY_URL, "dev_123", 0);
      }).pipe(Effect.provide(layer)),
    );

    expect(result.access_token).toBe("axm_ses_after_pending");
    expect(callCount).toBe(3);
  });

  it("fails with AUTH_LOGIN_CANCELLED on access_denied", async () => {
    const layer = makeTestLayer(
      () => new Response(JSON.stringify({ error: "access_denied" }), { status: 400 }),
    );

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* AuthClient;
        return yield* client.pollDeviceToken(REGISTRY_URL, "dev_123", 0).pipe(Effect.either);
      }).pipe(Effect.provide(layer)),
    );

    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left.code).toBe("AUTH_LOGIN_CANCELLED");
    }
  });

  it("fails with AUTH_LOGIN_FAILED on expired_token", async () => {
    const layer = makeTestLayer(
      () => new Response(JSON.stringify({ error: "expired_token" }), { status: 400 }),
    );

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* AuthClient;
        return yield* client.pollDeviceToken(REGISTRY_URL, "dev_123", 0).pipe(Effect.either);
      }).pipe(Effect.provide(layer)),
    );

    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left.code).toBe("AUTH_LOGIN_FAILED");
    }
  });
});

// -----------------------------------------------------------------------------
// refreshToken
// -----------------------------------------------------------------------------

describe("AuthClient.refreshToken", () => {
  it("returns new tokens on success", async () => {
    const layer = makeTestLayer((req) => {
      expect(req.url).toContain("/v1/auth/token/refresh");
      return new Response(
        JSON.stringify({
          access_token: "axm_ses_refreshed",
          refresh_token: "axm_ref_refreshed",
          expires_at: futureExpiry(),
        }),
        { status: 200 },
      );
    });

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* AuthClient;
        return yield* client.refreshToken(REGISTRY_URL, "axm_ref_old");
      }).pipe(Effect.provide(layer)),
    );

    expect(result.access_token).toBe("axm_ses_refreshed");
    expect(result.refresh_token).toBe("axm_ref_refreshed");
  });

  it("fails with AUTH_REFRESH_FAILED on non-200", async () => {
    const layer = makeTestLayer(
      () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }),
    );

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* AuthClient;
        return yield* client.refreshToken(REGISTRY_URL, "axm_ref_expired").pipe(Effect.either);
      }).pipe(Effect.provide(layer)),
    );

    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left.code).toBe("AUTH_REFRESH_FAILED");
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
      return new Response("", { status: 200 });
    });

    await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* AuthClient;
        yield* client.revokeToken(REGISTRY_URL, "axm_ses_revoke");
      }).pipe(Effect.provide(layer)),
    );
  });

  it("succeeds (non-fatal) on server error", async () => {
    const layer = makeTestLayer(() => new Response("internal error", { status: 500 }));

    // Should not throw — revoke is best-effort
    await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* AuthClient;
        yield* client.revokeToken(REGISTRY_URL, "axm_ses_revoke");
      }).pipe(Effect.provide(layer)),
    );
  });

  it("succeeds (non-fatal) on 204", async () => {
    const layer = makeTestLayer(() => new Response(null, { status: 204 }));

    await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* AuthClient;
        yield* client.revokeToken(REGISTRY_URL, "axm_ses_revoke");
      }).pipe(Effect.provide(layer)),
    );
  });
});

// -----------------------------------------------------------------------------
// getMe
// -----------------------------------------------------------------------------

describe("AuthClient.getMe", () => {
  it("returns identity on success", async () => {
    let capturedAuth: string | null = null;

    const layer = makeTestLayer((req) => {
      capturedAuth = (req.headers["authorization"] as string) ?? null;
      return new Response(
        JSON.stringify({
          userId: "user_123",
          userHandle: "alice",
          email: "alice@example.com",
          tokenType: "session",
          scopes: ["extensions:read", "account:read"],
          orgs: [{ id: "org_1", handle: "acme" }],
        }),
        { status: 200 },
      );
    });

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* AuthClient;
        return yield* client.getMe(REGISTRY_URL, "axm_ses_test");
      }).pipe(Effect.provide(layer)),
    );

    expect(capturedAuth).toBe("Bearer axm_ses_test");
    expect(result.userId).toBe("user_123");
    expect(result.userHandle).toBe("alice");
    expect(result.email).toBe("alice@example.com");
    expect(result.tokenType).toBe("session");
    expect(result.scopes).toEqual(["extensions:read", "account:read"]);
    expect(result.orgs).toEqual([{ id: "org_1", handle: "acme" }]);
  });

  it("fails with AUTH_UNAUTHENTICATED on 401", async () => {
    const layer = makeTestLayer(() => new Response("unauthorized", { status: 401 }));

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* AuthClient;
        return yield* client.getMe(REGISTRY_URL, "axm_ses_bad").pipe(Effect.either);
      }).pipe(Effect.provide(layer)),
    );

    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left.code).toBe("AUTH_UNAUTHENTICATED");
    }
  });

  it("fails with AUTH_UNAUTHENTICATED on 403", async () => {
    const layer = makeTestLayer(() => new Response("forbidden", { status: 403 }));

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* AuthClient;
        return yield* client.getMe(REGISTRY_URL, "axm_ses_bad").pipe(Effect.either);
      }).pipe(Effect.provide(layer)),
    );

    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left.code).toBe("AUTH_UNAUTHENTICATED");
    }
  });

  it("fails with AUTH_UNAUTHENTICATED on unexpected status", async () => {
    const layer = makeTestLayer(() => new Response("error", { status: 500 }));

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* AuthClient;
        return yield* client.getMe(REGISTRY_URL, "axm_ses_bad").pipe(Effect.either);
      }).pipe(Effect.provide(layer)),
    );

    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left.code).toBe("AUTH_UNAUTHENTICATED");
    }
  });
});
