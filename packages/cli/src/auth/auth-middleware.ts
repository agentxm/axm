/**
 * Auth middleware — HttpClient wrapping layer.
 *
 * Intercepts outgoing HTTP requests to inject Bearer tokens, handle
 * automatic refresh on 401, and proactive refresh for near-expiry tokens.
 *
 * Layer composition: wraps the base HttpClient so all downstream consumers
 * get auth headers automatically for registry URLs.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as ServiceMap from "effect/ServiceMap";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { makeAppError } from "@axm.sh/core/unstable/app-error";
import { CliEnvConfig } from "../config/index.js";
import { CredentialStore, type CredentialStoreService } from "./credential-store.js";
import {
  decodeTokenResponse,
  setOAuthFormBody,
  type NormalizedTokenResponse,
} from "./oauth-contract.js";
import type { StoredCredentials, TokenSource } from "./schema.js";
import { resolveAmbientToken, resolveStoredToken } from "./token-resolution.js";

// -----------------------------------------------------------------------------
// RegistryUrl service — configures which URLs are registry URLs
// -----------------------------------------------------------------------------

export class RegistryUrl extends ServiceMap.Service<RegistryUrl, string>()(
  "@axm.sh/cli/RegistryUrl",
) {}

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const PREFLIGHT_EXPIRY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

// -----------------------------------------------------------------------------
// Internal: token refresh via base client
// -----------------------------------------------------------------------------

const refreshTokenRequest = (
  baseClient: HttpClient.HttpClient,
  registryUrl: string,
  refreshTokenValue: string,
) =>
  Effect.gen(function* () {
    const url = `${registryUrl.replace(/\/+$/, "")}/v1/auth/token/refresh`;
    const request = setOAuthFormBody(HttpClientRequest.post(url), {
      grant_type: "refresh_token",
      refresh_token: refreshTokenValue,
    });
    const response = yield* baseClient.execute(request).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "AUTH_REFRESH_FAILED",
          what: "Token refresh request failed",
          howToFix: "Run `axm login` to re-authenticate.",
          cause: error,
        }),
      ),
    );

    if (response.status !== 200) {
      return yield* Effect.fail(
        makeAppError({
          code: "AUTH_REFRESH_FAILED",
          what: `Token refresh returned status ${String(response.status)}`,
          howToFix: "Run `axm login` to re-authenticate.",
        }),
      );
    }

    const bodyText = yield* response.text.pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "AUTH_REFRESH_FAILED",
          what: "Failed to read refresh response body",
          cause: error,
        }),
      ),
    );

    const json = yield* Effect.try({
      try: () => JSON.parse(bodyText) as unknown,
      catch: (error) =>
        makeAppError({
          code: "AUTH_REFRESH_FAILED",
          what: "Failed to parse refresh response",
          cause: error,
        }),
    });

    return yield* decodeTokenResponse(json, "AUTH_REFRESH_FAILED", "token refresh");
  });

// -----------------------------------------------------------------------------
// Internal: persist refreshed credentials
// -----------------------------------------------------------------------------

const persistRefreshedCredentials = (
  store: CredentialStoreService,
  registryUrl: string,
  newCredentials: NormalizedTokenResponse,
) =>
  Effect.gen(function* () {
    const existing = yield* store.load(registryUrl);
    const handle = Option.match(existing, {
      onNone: () => "unknown",
      onSome: (creds: StoredCredentials) => creds.handle,
    });
    yield* store.save(registryUrl, handle, {
      access_token: newCredentials.access_token,
      refresh_token: newCredentials.refresh_token,
      expires_at: newCredentials.expires_at,
    });
  });

// -----------------------------------------------------------------------------
// Internal: check if token is near expiry
// -----------------------------------------------------------------------------

const isNearExpiry = (expiresAt: string): boolean => {
  const expiryTime = new Date(expiresAt).getTime();
  const now = Date.now();
  return expiryTime - now < PREFLIGHT_EXPIRY_WINDOW_MS;
};

// -----------------------------------------------------------------------------
// AuthMiddleware layer
// -----------------------------------------------------------------------------

/**
 * Creates an auth middleware layer that wraps HttpClient with token injection,
 * proactive refresh, and automatic 401 retry.
 *
 * The `flagToken` parameter allows per-command --token flag injection.
 */
export const makeAuthMiddlewareLive = (flagToken?: string) =>
  Layer.effect(
    HttpClient.HttpClient,
    Effect.gen(function* () {
      const baseClient = yield* HttpClient.HttpClient;
      const store = yield* CredentialStore;
      const registryUrl = yield* RegistryUrl;
      const envConfig = yield* CliEnvConfig;

      // Provide CredentialStore and CliEnvConfig for resolve calls within the middleware
      const storeLayer = Layer.succeed(CredentialStore, store);
      const envConfigLayer = Layer.succeed(CliEnvConfig, envConfig);

      return HttpClient.make((request) =>
        Effect.gen(function* () {
          const origin = new URL(request.url).origin;

          // 1. Check stored credentials for this origin (any registry)
          const storedToken = yield* resolveStoredToken(origin).pipe(
            Effect.provide(storeLayer),
            Effect.catch(() => Effect.succeed(Option.none<TokenSource>())),
          );

          // 2. If no stored credentials and this is the default registry, check ambient tokens
          const maybeToken = Option.isSome(storedToken)
            ? storedToken
            : origin === new URL(registryUrl).origin
              ? yield* resolveAmbientToken(flagToken).pipe(Effect.provide(envConfigLayer))
              : Option.none<TokenSource>();

          if (Option.isNone(maybeToken)) {
            return yield* baseClient.execute(request);
          }

          const tokenSource = maybeToken.value;
          let currentToken = tokenSource.token;

          // Proactive refresh for credential store tokens near expiry
          if (tokenSource._tag === "CredentialStore" && isNearExpiry(tokenSource.expires_at)) {
            const refreshResult = yield* refreshTokenRequest(
              baseClient,
              tokenSource.registryUrl,
              tokenSource.refresh_token,
            ).pipe(Effect.option);

            if (Option.isSome(refreshResult)) {
              yield* persistRefreshedCredentials(
                store,
                tokenSource.registryUrl,
                refreshResult.value,
              ).pipe(Effect.catch(() => Effect.void));
              currentToken = refreshResult.value.access_token;
            }
          }

          // Inject Bearer header
          const authedRequest = HttpClientRequest.bearerToken(request, currentToken);
          const response = yield* baseClient.execute(authedRequest);

          // Automatic refresh on 401 (credential store tokens only)
          if (response.status === 401 && tokenSource._tag === "CredentialStore") {
            const refreshResult = yield* refreshTokenRequest(
              baseClient,
              tokenSource.registryUrl,
              tokenSource.refresh_token,
            ).pipe(Effect.option);

            if (Option.isSome(refreshResult)) {
              yield* persistRefreshedCredentials(
                store,
                tokenSource.registryUrl,
                refreshResult.value,
              ).pipe(Effect.catch(() => Effect.void));
              const retryRequest = HttpClientRequest.bearerToken(
                request,
                refreshResult.value.access_token,
              );
              return yield* baseClient.execute(retryRequest);
            }

            return response;
          }

          return response;
        }),
      );
    }),
  );

/**
 * Default auth middleware layer (no --token flag).
 */
export const AuthMiddlewareLive = makeAuthMiddlewareLive();
