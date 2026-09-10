/**
 * Unit tests for auth middleware.
 *
 * Covers: header injection, pass-through when no token, non-registry URL
 * pass-through, automatic 401 refresh, proactive refresh, single-retry-only,
 * no refresh for env-var/flag tokens.
 */

import { describe, it } from "@effect/vitest";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach, expect } from "vitest";

import { AuthClientLive } from "./auth-client.js";
import {
  CredentialStore,
  CredentialStoreSessionLive,
  CredentialStoreTest,
  type CredentialStoreService,
} from "./credential-store.js";
import { makeAuthMiddlewareLive } from "./auth-middleware.js";
import { RegistryAuthFailed } from "./errors.js";
import { RegistryUrl } from "@agentxm/registry-client";
import { handle } from "./test-helpers.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const REGISTRY_URL = "https://registry.agentxm.ai";

type MockResponse = Response | Effect.Effect<Response>;

const makeMockHttpClient = (
  handler: (request: HttpClientRequest.HttpClientRequest) => MockResponse,
) =>
  HttpClient.make((request) =>
    Effect.suspend(() => {
      const result = handler(request);
      return Effect.isEffect(result) ? result : Effect.succeed(result);
    }).pipe(Effect.map((response) => HttpClientResponse.fromWeb(request, response))),
  );

const authorizationHeader = (request: HttpClientRequest.HttpClientRequest): string | null => {
  const header = request.headers["authorization"];
  return typeof header === "string" ? header : null;
};

const makeTestLayers = (
  handler: (request: HttpClientRequest.HttpClientRequest) => MockResponse,
  credentialData?: Parameters<typeof CredentialStoreTest>[1],
  flagToken?: string,
  credentialStoreService?: CredentialStoreService,
) => {
  const baseClientLayer = Layer.succeed(HttpClient.HttpClient, makeMockHttpClient(handler));
  const rawCredStoreLayer =
    credentialStoreService === undefined
      ? CredentialStoreTest("restricted-file", credentialData)
      : Layer.succeed(CredentialStore, credentialStoreService);
  const credStoreLayer = Layer.provide(CredentialStoreSessionLive, rawCredStoreLayer);
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

const futureExpiry = () => DateTime.add(DateTime.nowUnsafe(), { hours: 1 });
const nearExpiry = () => DateTime.add(DateTime.nowUnsafe(), { minutes: 2 });

const storedCredentials = (expiresAt?: DateTime.Utc) => ({
  version: 1 as const,
  registries: {
    [REGISTRY_URL]: {
      accounts: {
        "@alice": {
          access_token: "axm_ses_stored",
          refresh_token: "axm_ref_stored",
          expires_at: expiresAt ?? futureExpiry(),
          active: true,
        },
      },
    },
  },
});

const makeCountingCredentialStore = (
  initial: Readonly<Record<string, Option.Option<Parameters<CredentialStoreService["save"]>[2]>>>,
  failingOrigins: ReadonlySet<string> = new Set(),
) => {
  const credentials = new Map(Object.entries(initial));
  const loadCounts = new Map<string, number>();
  const service: CredentialStoreService = {
    tier: "restricted-file",
    allowsPersistedCredentials: true,
    load: (origin) =>
      Effect.gen(function* () {
        loadCounts.set(origin, (loadCounts.get(origin) ?? 0) + 1);
        if (failingOrigins.has(origin)) {
          return yield* new RegistryAuthFailed({
            category: "auth",
            detail: `Credential load failed for ${origin}`,
          });
        }
        const entry = credentials.get(origin);
        if (entry === undefined || Option.isNone(entry)) return Option.none();
        return Option.some({ handle: handle("@alice"), ...entry.value });
      }),
    save: (origin, _handle, entry) =>
      Effect.sync(() => {
        credentials.set(origin, Option.some(entry));
      }),
    clear: (origin) =>
      Effect.sync(() => {
        credentials.delete(origin);
      }),
  };
  return { service, loadCounts };
};

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("AuthMiddleware", () => {
  let origAxmToken: string | undefined;

  beforeEach(() => {
    origAxmToken = process.env["AXM_TOKEN"];
    delete process.env["AXM_TOKEN"];
  });

  afterEach(() => {
    if (origAxmToken !== undefined) process.env["AXM_TOKEN"] = origAxmToken;
    else delete process.env["AXM_TOKEN"];
  });

  // ---------------------------------------------------------------------------
  // Header injection
  // ---------------------------------------------------------------------------

  describe("header injection", () => {
    it.effect("injects Bearer header for credential store token", () => {
      let capturedAuth: string | null = null;

      const layers = makeTestLayers((req) => {
        capturedAuth = authorizationHeader(req);
        return new Response("ok", { status: 200 });
      }, storedCredentials());

      return Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        const request = HttpClientRequest.get(`${REGISTRY_URL}/v1/extensions`);
        yield* client.execute(request);
        expect(capturedAuth).toBe("Bearer axm_ses_stored");
      }).pipe(Effect.provide(layers));
    });

    it.effect("injects Bearer header for AXM_TOKEN env var", () => {
      process.env["AXM_TOKEN"] = "axm_ses_env";
      let capturedAuth: string | null = null;

      const layers = makeTestLayers((req) => {
        capturedAuth = authorizationHeader(req);
        return new Response("ok", { status: 200 });
      });

      return Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        const request = HttpClientRequest.get(`${REGISTRY_URL}/v1/extensions`);
        yield* client.execute(request);
        expect(capturedAuth).toBe("Bearer axm_ses_env");
      }).pipe(Effect.provide(layers));
    });

    it.effect("prefers AXM_TOKEN over stored credentials for the default registry", () => {
      process.env["AXM_TOKEN"] = "axm_ses_env";
      let capturedAuth: string | null = null;

      const layers = makeTestLayers((req) => {
        capturedAuth = authorizationHeader(req);
        return new Response("ok", { status: 200 });
      }, storedCredentials());

      return Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        const request = HttpClientRequest.get(`${REGISTRY_URL}/v1/extensions`);
        yield* client.execute(request);
        expect(capturedAuth).toBe("Bearer axm_ses_env");
      }).pipe(Effect.provide(layers));
    });

    it.effect("injects Bearer header for --token flag", () => {
      let capturedAuth: string | null = null;

      const layers = makeTestLayers(
        (req) => {
          capturedAuth = authorizationHeader(req);
          return new Response("ok", { status: 200 });
        },
        undefined,
        "axm_ses_flag",
      );

      return Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        const request = HttpClientRequest.get(`${REGISTRY_URL}/v1/extensions`);
        yield* client.execute(request);
        expect(capturedAuth).toBe("Bearer axm_ses_flag");
      }).pipe(Effect.provide(layers));
    });

    it.effect("prefers --token over stored credentials for the default registry", () => {
      let capturedAuth: string | null = null;

      const layers = makeTestLayers(
        (req) => {
          capturedAuth = authorizationHeader(req);
          return new Response("ok", { status: 200 });
        },
        storedCredentials(),
        "axm_ses_flag",
      );

      return Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        const request = HttpClientRequest.get(`${REGISTRY_URL}/v1/extensions`);
        yield* client.execute(request);
        expect(capturedAuth).toBe("Bearer axm_ses_flag");
      }).pipe(Effect.provide(layers));
    });
  });

  // ---------------------------------------------------------------------------
  // Pass-through
  // ---------------------------------------------------------------------------

  describe("pass-through", () => {
    it.effect("sends request without auth when no token is available", () => {
      let capturedAuth: string | null = null;

      const layers = makeTestLayers((req) => {
        capturedAuth = authorizationHeader(req);
        return new Response("ok", { status: 200 });
      });

      return Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        const request = HttpClientRequest.get(`${REGISTRY_URL}/v1/extensions`);
        yield* client.execute(request);
        expect(capturedAuth).toBeNull();
      }).pipe(Effect.provide(layers));
    });

    it.effect("does not inject auth for non-registry URLs", () => {
      let capturedAuth: string | null = null;

      const layers = makeTestLayers((req) => {
        capturedAuth = authorizationHeader(req);
        return new Response("ok", { status: 200 });
      }, storedCredentials());

      return Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        const request = HttpClientRequest.get("https://other-api.example.com/data");
        yield* client.execute(request);
        expect(capturedAuth).toBeNull();
      }).pipe(Effect.provide(layers));
    });
  });

  // ---------------------------------------------------------------------------
  // Automatic 401 refresh
  // ---------------------------------------------------------------------------

  describe("automatic refresh on 401", () => {
    it.effect("refreshes and retries on 401 for credential store tokens", () => {
      let requestCount = 0;

      const layers = makeTestLayers((req) => {
        requestCount++;
        const url = req.url;

        // Refresh endpoint — response must match generated AuthRefreshToken200 schema
        if (url.includes("/v1/auth/token")) {
          return new Response(
            JSON.stringify({
              access_token: "axm_ses_refreshed",
              refresh_token: "axm_ref_refreshed",
              token_type: "Bearer",
              expires_in: 3600,
              expires_at: DateTime.formatIso(futureExpiry()),
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

      return Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        const request = HttpClientRequest.get(`${REGISTRY_URL}/v1/extensions`);
        const response = yield* client.execute(request);
        expect(response.status).toBe(200);
        // 1 original + 1 refresh + 1 retry = 3
        expect(requestCount).toBe(3);
      }).pipe(Effect.provide(layers));
    });

    it.effect("returns 401 when refresh fails", () => {
      const layers = makeTestLayers((req) => {
        if (req.url.includes("/v1/auth/token")) {
          return new Response("forbidden", { status: 403 });
        }
        return new Response("unauthorized", { status: 401 });
      }, storedCredentials());

      return Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        const request = HttpClientRequest.get(`${REGISTRY_URL}/v1/extensions`);
        const response = yield* client.execute(request);
        expect(response.status).toBe(401);
      }).pipe(Effect.provide(layers));
    });

    it.effect("does not refresh for env var tokens on 401", () => {
      process.env["AXM_TOKEN"] = "axm_ses_env";
      let refreshCalled = false;

      const layers = makeTestLayers((req) => {
        if (req.url.includes("/v1/auth/token")) {
          refreshCalled = true;
          return new Response("ok", { status: 200 });
        }
        return new Response("unauthorized", { status: 401 });
      });

      return Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        const request = HttpClientRequest.get(`${REGISTRY_URL}/v1/extensions`);
        const response = yield* client.execute(request);
        expect(response.status).toBe(401);
        expect(refreshCalled).toBe(false);
      }).pipe(Effect.provide(layers));
    });

    it.effect("does not refresh for flag tokens on 401", () => {
      let refreshCalled = false;

      const layers = makeTestLayers(
        (req) => {
          if (req.url.includes("/v1/auth/token")) {
            refreshCalled = true;
            return new Response("ok", { status: 200 });
          }
          return new Response("unauthorized", { status: 401 });
        },
        undefined,
        "axm_ses_flag",
      );

      return Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        const request = HttpClientRequest.get(`${REGISTRY_URL}/v1/extensions`);
        const response = yield* client.execute(request);
        expect(response.status).toBe(401);
        expect(refreshCalled).toBe(false);
      }).pipe(Effect.provide(layers));
    });

    it.effect("only retries once after refresh (single retry)", () => {
      let mainRequestCount = 0;

      const layers = makeTestLayers((req) => {
        if (req.url.includes("/v1/auth/token")) {
          return new Response(
            JSON.stringify({
              access_token: "axm_ses_refreshed",
              refresh_token: "axm_ref_refreshed",
              token_type: "Bearer",
              expires_in: 3600,
              expires_at: DateTime.formatIso(futureExpiry()),
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        mainRequestCount++;
        // Always return 401 — the middleware should still only retry once
        return new Response("unauthorized", { status: 401 });
      }, storedCredentials());

      return Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        const request = HttpClientRequest.get(`${REGISTRY_URL}/v1/extensions`);
        const response = yield* client.execute(request);
        // Retry also returned 401 — middleware returns it
        expect(response.status).toBe(401);
        // Original request + 1 retry = 2
        expect(mainRequestCount).toBe(2);
      }).pipe(Effect.provide(layers));
    });
  });

  // ---------------------------------------------------------------------------
  // Near-expiry tokens
  // ---------------------------------------------------------------------------

  describe("near-expiry tokens", () => {
    it.effect("sends near-expiry token as-is without proactive refresh", () => {
      let capturedAuth: string | null = null;

      const layers = makeTestLayers((req) => {
        capturedAuth = authorizationHeader(req);
        return new Response("ok", { status: 200 });
      }, storedCredentials(nearExpiry()));

      return Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        const request = HttpClientRequest.get(`${REGISTRY_URL}/v1/extensions`);
        yield* client.execute(request);
        expect(capturedAuth).toBe("Bearer axm_ses_stored");
      }).pipe(Effect.provide(layers));
    });
  });

  // ---------------------------------------------------------------------------
  // Credential-based gating
  // ---------------------------------------------------------------------------

  describe("credential-based gating", () => {
    it.effect("injects auth for non-default registry with stored credentials", () => {
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
              [handle("@bob")]: {
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

      return Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        const request = HttpClientRequest.get(`${NON_DEFAULT_REGISTRY}/v1/extensions`);
        yield* client.execute(request);
        expect(capturedAuth).toBe("Bearer axm_ses_custom");
      }).pipe(Effect.provide(layers));
    });

    it.effect("scopes AXM_TOKEN to default registry only", () => {
      process.env["AXM_TOKEN"] = "axm_ses_env_scoped";
      let capturedAuth: string | null = null;

      const layers = makeTestLayers((req) => {
        capturedAuth = authorizationHeader(req);
        return new Response("ok", { status: 200 });
      });

      return Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        const request = HttpClientRequest.get("https://other-registry.example.com/v1/extensions");
        yield* client.execute(request);
        // AXM_TOKEN should NOT leak to non-default registry hosts
        expect(capturedAuth).toBeNull();
      }).pipe(Effect.provide(layers));
    });

    it.effect("does not leak AXM_TOKEN to non-registry hosts", () => {
      process.env["AXM_TOKEN"] = "axm_ses_env_leak_test";
      let capturedAuth: string | null = null;

      const layers = makeTestLayers((req) => {
        capturedAuth = authorizationHeader(req);
        return new Response("ok", { status: 200 });
      });

      return Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        const request = HttpClientRequest.get("https://github.com/some/repo");
        yield* client.execute(request);
        expect(capturedAuth).toBeNull();
      }).pipe(Effect.provide(layers));
    });

    it.effect("uses AXM_TOKEN with empty credential store against default registry", () => {
      process.env["AXM_TOKEN"] = "axm_ses_env_default";
      let capturedAuth: string | null = null;

      const layers = makeTestLayers((req) => {
        capturedAuth = authorizationHeader(req);
        return new Response("ok", { status: 200 });
      });

      return Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        const request = HttpClientRequest.get(`${REGISTRY_URL}/v1/extensions`);
        yield* client.execute(request);
        expect(capturedAuth).toBe("Bearer axm_ses_env_default");
      }).pipe(Effect.provide(layers));
    });
  });

  describe("per-run credential coordination", () => {
    it.effect("shares one refresh across concurrent 401 responses", () =>
      Effect.gen(function* () {
        const requestCount = 6;
        let refreshRequests = 0;

        const layers = makeTestLayers((request) => {
          if (request.url.includes("/v1/auth/token")) {
            refreshRequests++;
            return Effect.yieldNow.pipe(
              Effect.as(
                new Response(
                  JSON.stringify({
                    access_token: "axm_ses_refreshed",
                    refresh_token: "axm_ref_refreshed",
                    token_type: "Bearer",
                    expires_in: 3600,
                    expires_at: DateTime.formatIso(futureExpiry()),
                  }),
                  { status: 200, headers: { "content-type": "application/json" } },
                ),
              ),
            );
          }
          if (authorizationHeader(request) === "Bearer axm_ses_stored") {
            return new Response("unauthorized", { status: 401 });
          }
          return new Response("ok", { status: 200 });
        }, storedCredentials());

        const client = yield* HttpClient.HttpClient.pipe(Effect.provide(layers));
        const responses = yield* Effect.all(
          Array.from({ length: requestCount }, () =>
            client.execute(HttpClientRequest.get(`${REGISTRY_URL}/v1/extensions`)),
          ),
          { concurrency: "unbounded" },
        );

        expect(responses.map((response) => response.status)).toEqual(
          Array.from({ length: requestCount }, () => 200),
        );
        expect(refreshRequests).toBe(1);
      }),
    );

    it.effect("invalidates the memo after a credential write", () => {
      const observed: Array<string | null> = [];
      const layers = makeTestLayers((request) => {
        observed.push(authorizationHeader(request));
        return new Response("ok", { status: 200 });
      }, storedCredentials());

      return Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        const store = yield* CredentialStore;
        const request = HttpClientRequest.get(`${REGISTRY_URL}/v1/extensions`);
        yield* client.execute(request);
        yield* store.save(REGISTRY_URL, handle("@alice"), {
          access_token: "axm_ses_new",
          refresh_token: "axm_ref_new",
          expires_at: futureExpiry(),
        });
        yield* client.execute(request);
        expect(observed).toEqual(["Bearer axm_ses_stored", "Bearer axm_ses_new"]);
      }).pipe(Effect.provide(layers));
    });

    it.effect("memoizes credential loads independently by origin", () => {
      const secondRegistry = "https://registry-two.example.com";
      const firstEntry = {
        access_token: "axm_ses_first",
        refresh_token: "axm_ref_first",
        expires_at: futureExpiry(),
      };
      const secondEntry = {
        access_token: "axm_ses_second",
        refresh_token: "axm_ref_second",
        expires_at: futureExpiry(),
      };
      const counting = makeCountingCredentialStore({
        [REGISTRY_URL]: Option.some(firstEntry),
        [secondRegistry]: Option.some(secondEntry),
      });
      const layers = makeTestLayers(
        () => new Response("ok", { status: 200 }),
        undefined,
        undefined,
        counting.service,
      );

      return Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        for (const origin of [REGISTRY_URL, secondRegistry, REGISTRY_URL, secondRegistry]) {
          yield* client.execute(HttpClientRequest.get(`${origin}/v1/extensions`));
        }
        expect(counting.loadCounts.get(REGISTRY_URL)).toBe(1);
        expect(counting.loadCounts.get(secondRegistry)).toBe(1);
      }).pipe(Effect.provide(layers));
    });

    it.effect("degrades a credential load failure to anonymous without caching it", () => {
      const counting = makeCountingCredentialStore({}, new Set([REGISTRY_URL]));
      const observed: Array<string | null> = [];
      const layers = makeTestLayers(
        (request) => {
          observed.push(authorizationHeader(request));
          return new Response("ok", { status: 200 });
        },
        undefined,
        undefined,
        counting.service,
      );

      return Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        const request = HttpClientRequest.get(`${REGISTRY_URL}/v1/extensions`);
        yield* client.execute(request);
        yield* client.execute(request);
        expect(observed).toEqual([null, null]);
        expect(counting.loadCounts.get(REGISTRY_URL)).toBe(2);
      }).pipe(Effect.provide(layers));
    });

    it.effect("shares a failed refresh and returns every original 401", () =>
      Effect.gen(function* () {
        const requestCount = 6;
        let refreshRequests = 0;
        const layers = makeTestLayers((request) => {
          if (request.url.includes("/v1/auth/token")) {
            refreshRequests++;
            return Effect.yieldNow.pipe(Effect.as(new Response("forbidden", { status: 403 })));
          }
          return new Response("unauthorized", { status: 401 });
        }, storedCredentials());

        const client = yield* HttpClient.HttpClient.pipe(Effect.provide(layers));
        const responses = yield* Effect.all(
          Array.from({ length: requestCount }, () =>
            client.execute(HttpClientRequest.get(`${REGISTRY_URL}/v1/extensions`)),
          ),
          { concurrency: "unbounded" },
        );

        expect(responses.map((response) => response.status)).toEqual(
          Array.from({ length: requestCount }, () => 401),
        );
        expect(refreshRequests).toBe(1);
      }),
    );

    it.effect("does not load credentials until an HTTP request is executed", () => {
      const counting = makeCountingCredentialStore({});
      const layers = makeTestLayers(
        () => new Response("ok", { status: 200 }),
        undefined,
        undefined,
        counting.service,
      );
      return Effect.gen(function* () {
        yield* HttpClient.HttpClient;
        expect(counting.loadCounts.size).toBe(0);
      }).pipe(Effect.provide(layers));
    });
  });
});
