/**
 * Unit tests for auth middleware.
 *
 * Covers: header injection, pass-through when no token, non-registry URL
 * pass-through, automatic 401 refresh, proactive refresh, single-retry-only,
 * no refresh for env-var/flag tokens, and AXM_TOKEN stderr message.
 */

import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AuthClientLive } from "./auth-client.js";
import { CredentialStoreTest } from "./credential-store.js";
import { makeAuthMiddlewareLive } from "./auth-middleware.js";
import { RegistryUrl } from "./registry-url.js";
import { isEnvVarMessageEmitted, resetEnvVarMessageFlag } from "./token-resolution.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const REGISTRY_URL = "https://registry.agentxm.ai";

const makeMockHttpClient = (handler: (request: HttpClientRequest.HttpClientRequest) => Response) =>
  HttpClient.make((request) =>
    Effect.sync(() => HttpClientResponse.fromWeb(request, handler(request))),
  );

const authorizationHeader = (request: HttpClientRequest.HttpClientRequest): string | null => {
  const header = request.headers["authorization"];
  return typeof header === "string" ? header : null;
};

const makeTestLayers = (
  handler: (request: HttpClientRequest.HttpClientRequest) => Response,
  credentialData?: Parameters<typeof CredentialStoreTest>[1],
  flagToken?: string,
) => {
  const baseClientLayer = Layer.succeed(HttpClient.HttpClient, makeMockHttpClient(handler));
  const credStoreLayer = CredentialStoreTest("restricted-file", credentialData);
  const registryUrlLayer = Layer.succeed(RegistryUrl, REGISTRY_URL);
  const authClientLayer = Layer.provide(
    AuthClientLive,
    Layer.mergeAll(baseClientLayer, registryUrlLayer),
  );

  // Auth middleware depends on HttpClient, CredentialStore, AuthClient, RegistryUrl
  const middlewareLayer = Layer.provide(
    makeAuthMiddlewareLive(flagToken),
    Layer.mergeAll(baseClientLayer, credStoreLayer, authClientLayer, registryUrlLayer),
  );

  // Merge credential store so tests can access it
  return Layer.mergeAll(middlewareLayer, credStoreLayer, authClientLayer, registryUrlLayer);
};

const futureExpiry = () => new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
const nearExpiry = () => new Date(Date.now() + 2 * 60 * 1000).toISOString(); // 2 minutes

const storedCredentials = (expiresAt?: string) => ({
  version: 1 as const,
  registries: {
    [REGISTRY_URL]: {
      accounts: {
        alice: {
          access_token: "axm_ses_stored",
          refresh_token: "axm_ref_stored",
          expires_at: expiresAt ?? futureExpiry(),
          active: true,
        },
      },
    },
  },
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("AuthMiddleware", () => {
  let origAxmToken: string | undefined;

  beforeEach(() => {
    origAxmToken = process.env["AXM_TOKEN"];
    delete process.env["AXM_TOKEN"];
    resetEnvVarMessageFlag();
  });

  afterEach(() => {
    if (origAxmToken !== undefined) process.env["AXM_TOKEN"] = origAxmToken;
    else delete process.env["AXM_TOKEN"];
  });

  // ---------------------------------------------------------------------------
  // Header injection
  // ---------------------------------------------------------------------------

  describe("header injection", () => {
    it("injects Bearer header for credential store token", async () => {
      let capturedAuth: string | null = null;

      const layers = makeTestLayers((req) => {
        capturedAuth = authorizationHeader(req);
        return new Response("ok", { status: 200 });
      }, storedCredentials());

      const program = Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        const request = HttpClientRequest.get(`${REGISTRY_URL}/v1/extensions`);
        return yield* client.execute(request);
      });

      await Effect.runPromise(program.pipe(Effect.provide(layers)));
      expect(capturedAuth).toBe("Bearer axm_ses_stored");
    });

    it("injects Bearer header for AXM_TOKEN env var", async () => {
      process.env["AXM_TOKEN"] = "axm_ses_env";
      let capturedAuth: string | null = null;

      const layers = makeTestLayers((req) => {
        capturedAuth = authorizationHeader(req);
        return new Response("ok", { status: 200 });
      });

      const program = Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        const request = HttpClientRequest.get(`${REGISTRY_URL}/v1/extensions`);
        return yield* client.execute(request);
      });

      await Effect.runPromise(program.pipe(Effect.provide(layers)));
      expect(capturedAuth).toBe("Bearer axm_ses_env");
    });

    it("prefers AXM_TOKEN over stored credentials for the default registry", async () => {
      process.env["AXM_TOKEN"] = "axm_ses_env";
      let capturedAuth: string | null = null;

      const layers = makeTestLayers((req) => {
        capturedAuth = authorizationHeader(req);
        return new Response("ok", { status: 200 });
      }, storedCredentials());

      const program = Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        const request = HttpClientRequest.get(`${REGISTRY_URL}/v1/extensions`);
        return yield* client.execute(request);
      });

      await Effect.runPromise(program.pipe(Effect.provide(layers)));
      expect(capturedAuth).toBe("Bearer axm_ses_env");
    });

    it("injects Bearer header for --token flag", async () => {
      let capturedAuth: string | null = null;

      const layers = makeTestLayers(
        (req) => {
          capturedAuth = authorizationHeader(req);
          return new Response("ok", { status: 200 });
        },
        undefined,
        "axm_ses_flag",
      );

      const program = Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        const request = HttpClientRequest.get(`${REGISTRY_URL}/v1/extensions`);
        return yield* client.execute(request);
      });

      await Effect.runPromise(program.pipe(Effect.provide(layers)));
      expect(capturedAuth).toBe("Bearer axm_ses_flag");
    });

    it("prefers --token over stored credentials for the default registry", async () => {
      let capturedAuth: string | null = null;

      const layers = makeTestLayers(
        (req) => {
          capturedAuth = authorizationHeader(req);
          return new Response("ok", { status: 200 });
        },
        storedCredentials(),
        "axm_ses_flag",
      );

      const program = Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        const request = HttpClientRequest.get(`${REGISTRY_URL}/v1/extensions`);
        return yield* client.execute(request);
      });

      await Effect.runPromise(program.pipe(Effect.provide(layers)));
      expect(capturedAuth).toBe("Bearer axm_ses_flag");
    });
  });

  // ---------------------------------------------------------------------------
  // Pass-through
  // ---------------------------------------------------------------------------

  describe("pass-through", () => {
    it("sends request without auth when no token is available", async () => {
      let capturedAuth: string | null = null;

      const layers = makeTestLayers((req) => {
        capturedAuth = authorizationHeader(req);
        return new Response("ok", { status: 200 });
      });

      const program = Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        const request = HttpClientRequest.get(`${REGISTRY_URL}/v1/extensions`);
        return yield* client.execute(request);
      });

      await Effect.runPromise(program.pipe(Effect.provide(layers)));
      expect(capturedAuth).toBeNull();
    });

    it("does not inject auth for non-registry URLs", async () => {
      let capturedAuth: string | null = null;

      const layers = makeTestLayers((req) => {
        capturedAuth = authorizationHeader(req);
        return new Response("ok", { status: 200 });
      }, storedCredentials());

      const program = Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        const request = HttpClientRequest.get("https://other-api.example.com/data");
        return yield* client.execute(request);
      });

      await Effect.runPromise(program.pipe(Effect.provide(layers)));
      expect(capturedAuth).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Automatic 401 refresh
  // ---------------------------------------------------------------------------

  describe("automatic refresh on 401", () => {
    it("refreshes and retries on 401 for credential store tokens", async () => {
      let requestCount = 0;

      const layers = makeTestLayers((req) => {
        requestCount++;
        const url = req.url;

        // Refresh endpoint — response must match generated AuthRefreshToken200 schema
        if (url.includes("/v1/auth/token/refresh")) {
          return new Response(
            JSON.stringify({
              access_token: "axm_ses_refreshed",
              refresh_token: "axm_ref_refreshed",
              token_type: "Bearer",
              expires_in: 3600,
              expires_at: futureExpiry(),
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }

        // First request returns 401, retry returns 200
        if (requestCount <= 1) {
          return new Response("unauthorized", { status: 401 });
        }
        return new Response("ok", { status: 200 });
      }, storedCredentials());

      const program = Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        const request = HttpClientRequest.get(`${REGISTRY_URL}/v1/extensions`);
        const response = yield* client.execute(request);
        return response.status;
      });

      const status = await Effect.runPromise(program.pipe(Effect.provide(layers)));
      expect(status).toBe(200);
      // 1 original + 1 refresh + 1 retry = 3
      expect(requestCount).toBe(3);
    });

    it("returns 401 when refresh fails", async () => {
      const layers = makeTestLayers((req) => {
        if (req.url.includes("/v1/auth/token/refresh")) {
          return new Response("forbidden", { status: 403 });
        }
        return new Response("unauthorized", { status: 401 });
      }, storedCredentials());

      const program = Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        const request = HttpClientRequest.get(`${REGISTRY_URL}/v1/extensions`);
        const response = yield* client.execute(request);
        return response.status;
      });

      const status = await Effect.runPromise(program.pipe(Effect.provide(layers)));
      expect(status).toBe(401);
    });

    it("does not refresh for env var tokens on 401", async () => {
      process.env["AXM_TOKEN"] = "axm_ses_env";
      let refreshCalled = false;

      const layers = makeTestLayers((req) => {
        if (req.url.includes("/v1/auth/token/refresh")) {
          refreshCalled = true;
          return new Response("ok", { status: 200 });
        }
        return new Response("unauthorized", { status: 401 });
      });

      const program = Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        const request = HttpClientRequest.get(`${REGISTRY_URL}/v1/extensions`);
        const response = yield* client.execute(request);
        return response.status;
      });

      const status = await Effect.runPromise(program.pipe(Effect.provide(layers)));
      expect(status).toBe(401);
      expect(refreshCalled).toBe(false);
    });

    it("does not refresh for flag tokens on 401", async () => {
      let refreshCalled = false;

      const layers = makeTestLayers(
        (req) => {
          if (req.url.includes("/v1/auth/token/refresh")) {
            refreshCalled = true;
            return new Response("ok", { status: 200 });
          }
          return new Response("unauthorized", { status: 401 });
        },
        undefined,
        "axm_ses_flag",
      );

      const program = Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        const request = HttpClientRequest.get(`${REGISTRY_URL}/v1/extensions`);
        const response = yield* client.execute(request);
        return response.status;
      });

      const status = await Effect.runPromise(program.pipe(Effect.provide(layers)));
      expect(status).toBe(401);
      expect(refreshCalled).toBe(false);
    });

    it("only retries once after refresh (single retry)", async () => {
      let mainRequestCount = 0;

      const layers = makeTestLayers((req) => {
        if (req.url.includes("/v1/auth/token/refresh")) {
          return new Response(
            JSON.stringify({
              access_token: "axm_ses_refreshed",
              refresh_token: "axm_ref_refreshed",
              token_type: "Bearer",
              expires_in: 3600,
              expires_at: futureExpiry(),
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        mainRequestCount++;
        // Always return 401 — the middleware should still only retry once
        return new Response("unauthorized", { status: 401 });
      }, storedCredentials());

      const program = Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        const request = HttpClientRequest.get(`${REGISTRY_URL}/v1/extensions`);
        const response = yield* client.execute(request);
        return response.status;
      });

      const status = await Effect.runPromise(program.pipe(Effect.provide(layers)));
      // Retry also returned 401 — middleware returns it
      expect(status).toBe(401);
      // Original request + 1 retry = 2
      expect(mainRequestCount).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // Near-expiry tokens
  // ---------------------------------------------------------------------------

  describe("near-expiry tokens", () => {
    it("sends near-expiry token as-is without proactive refresh", async () => {
      let capturedAuth: string | null = null;

      const layers = makeTestLayers((req) => {
        capturedAuth = authorizationHeader(req);
        return new Response("ok", { status: 200 });
      }, storedCredentials(nearExpiry()));

      const program = Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        const request = HttpClientRequest.get(`${REGISTRY_URL}/v1/extensions`);
        return yield* client.execute(request);
      });

      await Effect.runPromise(program.pipe(Effect.provide(layers)));
      expect(capturedAuth).toBe("Bearer axm_ses_stored");
    });
  });

  // ---------------------------------------------------------------------------
  // Credential-based gating
  // ---------------------------------------------------------------------------

  describe("credential-based gating", () => {
    it("injects auth for non-default registry with stored credentials", async () => {
      const NON_DEFAULT_REGISTRY = "https://custom-registry.example.com";
      let capturedAuth: string | null = null;

      const handler = (req: HttpClientRequest.HttpClientRequest) => {
        capturedAuth = authorizationHeader(req);
        return new Response("ok", { status: 200 });
      };

      const baseClientLayer = Layer.succeed(HttpClient.HttpClient, makeMockHttpClient(handler));
      const credStoreLayer = CredentialStoreTest("restricted-file", {
        version: 1,
        registries: {
          [NON_DEFAULT_REGISTRY]: {
            accounts: {
              bob: {
                access_token: "axm_ses_custom",
                refresh_token: "axm_ref_custom",
                expires_at: futureExpiry(),
                active: true,
              },
            },
          },
        },
      });
      const registryUrlLayer = Layer.succeed(RegistryUrl, REGISTRY_URL);
      const authClientLayer = Layer.provide(
        AuthClientLive,
        Layer.mergeAll(baseClientLayer, registryUrlLayer),
      );

      const middlewareLayer = Layer.provide(
        makeAuthMiddlewareLive(),
        Layer.mergeAll(baseClientLayer, credStoreLayer, authClientLayer, registryUrlLayer),
      );
      const layers = Layer.mergeAll(
        middlewareLayer,
        credStoreLayer,
        authClientLayer,
        registryUrlLayer,
      );

      const program = Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        const request = HttpClientRequest.get(`${NON_DEFAULT_REGISTRY}/v1/extensions`);
        return yield* client.execute(request);
      });

      await Effect.runPromise(program.pipe(Effect.provide(layers)));
      expect(capturedAuth).toBe("Bearer axm_ses_custom");
    });

    it("scopes AXM_TOKEN to default registry only", async () => {
      process.env["AXM_TOKEN"] = "axm_ses_env_scoped";
      let capturedAuth: string | null = null;

      const layers = makeTestLayers((req) => {
        capturedAuth = authorizationHeader(req);
        return new Response("ok", { status: 200 });
      });

      const program = Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        const request = HttpClientRequest.get("https://other-registry.example.com/v1/extensions");
        return yield* client.execute(request);
      });

      await Effect.runPromise(program.pipe(Effect.provide(layers)));
      // AXM_TOKEN should NOT leak to non-default registry hosts
      expect(capturedAuth).toBeNull();
    });

    it("does not leak AXM_TOKEN to non-registry hosts", async () => {
      process.env["AXM_TOKEN"] = "axm_ses_env_leak_test";
      let capturedAuth: string | null = null;

      const layers = makeTestLayers((req) => {
        capturedAuth = authorizationHeader(req);
        return new Response("ok", { status: 200 });
      });

      const program = Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        const request = HttpClientRequest.get("https://github.com/some/repo");
        return yield* client.execute(request);
      });

      await Effect.runPromise(program.pipe(Effect.provide(layers)));
      expect(capturedAuth).toBeNull();
    });

    it("uses AXM_TOKEN with empty credential store against default registry", async () => {
      process.env["AXM_TOKEN"] = "axm_ses_env_default";
      let capturedAuth: string | null = null;

      const layers = makeTestLayers((req) => {
        capturedAuth = authorizationHeader(req);
        return new Response("ok", { status: 200 });
      });

      const program = Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        const request = HttpClientRequest.get(`${REGISTRY_URL}/v1/extensions`);
        return yield* client.execute(request);
      });

      await Effect.runPromise(program.pipe(Effect.provide(layers)));
      expect(capturedAuth).toBe("Bearer axm_ses_env_default");
    });
  });

  // ---------------------------------------------------------------------------
  // AXM_TOKEN stderr message
  // ---------------------------------------------------------------------------

  describe("AXM_TOKEN stderr message", () => {
    it("emits warning once per invocation", async () => {
      process.env["AXM_TOKEN"] = "axm_ses_env";
      const layers = makeTestLayers((_req) => new Response("ok", { status: 200 }));

      const program = Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        // Make two requests
        yield* client.execute(HttpClientRequest.get(`${REGISTRY_URL}/v1/extensions`));
        yield* client.execute(HttpClientRequest.get(`${REGISTRY_URL}/v1/extensions`));
      });

      // The warning is emitted via Effect.logWarning; we verify the flag mechanism
      await Effect.runPromise(program.pipe(Effect.provide(layers)));
      expect(isEnvVarMessageEmitted()).toBe(true);
    });
  });
});
