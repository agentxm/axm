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

import * as HttpClient from "@effect/platform/HttpClient";
import * as HttpClientRequest from "@effect/platform/HttpClientRequest";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { makeCliError } from "../cli-error/cli-error.js";
import { CredentialStore, type CredentialStoreService } from "./credential-store.js";
import type { StoredCredentials, TokenSource } from "./schema.js";
import { resolveAmbientToken, resolveStoredToken } from "./token-resolution.js";

// -----------------------------------------------------------------------------
// RegistryUrl service — configures which URLs are registry URLs
// -----------------------------------------------------------------------------

export class RegistryUrl extends Context.Tag("@axm.sh/cli/RegistryUrl")<RegistryUrl, string>() {}

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const PREFLIGHT_EXPIRY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

// -----------------------------------------------------------------------------
// Refresh token response schema
// -----------------------------------------------------------------------------

const RefreshResponseSchema = Schema.Struct({
  access_token: Schema.String,
  refresh_token: Schema.String,
  expires_at: Schema.String,
});

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
    const request = yield* HttpClientRequest.post(url).pipe(
      HttpClientRequest.bodyJson({ refresh_token: refreshTokenValue }),
    );
    const response = yield* baseClient.execute(request).pipe(
      Effect.mapError((error) =>
        makeCliError({
          code: "AUTH_REFRESH_FAILED",
          what: "Token refresh request failed",
          howToFix: "Run `axm login` to re-authenticate.",
          cause: error,
        }),
      ),
    );

    if (response.status !== 200) {
      return yield* Effect.fail(
        makeCliError({
          code: "AUTH_REFRESH_FAILED",
          what: `Token refresh returned status ${String(response.status)}`,
          howToFix: "Run `axm login` to re-authenticate.",
        }),
      );
    }

    const bodyText = yield* response.text.pipe(
      Effect.mapError((error) =>
        makeCliError({
          code: "AUTH_REFRESH_FAILED",
          what: "Failed to read refresh response body",
          cause: error,
        }),
      ),
    );

    const json = yield* Effect.try({
      try: () => JSON.parse(bodyText) as unknown,
      catch: (error) =>
        makeCliError({
          code: "AUTH_REFRESH_FAILED",
          what: "Failed to parse refresh response",
          cause: error,
        }),
    });

    return yield* Schema.decodeUnknown(RefreshResponseSchema)(json).pipe(
      Effect.mapError((error) =>
        makeCliError({
          code: "AUTH_REFRESH_FAILED",
          what: "Invalid refresh response schema",
          cause: error,
        }),
      ),
    );
  });

// -----------------------------------------------------------------------------
// Internal: persist refreshed credentials
// -----------------------------------------------------------------------------

const persistRefreshedCredentials = (
  store: CredentialStoreService,
  registryUrl: string,
  newCredentials: typeof RefreshResponseSchema.Type,
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

      // Provide CredentialStore for resolveToken calls within the middleware
      const storeLayer = Layer.succeed(CredentialStore, store);

      return HttpClient.make((request) =>
        Effect.gen(function* () {
          const origin = new URL(request.url).origin;

          // 1. Check stored credentials for this origin (any registry)
          const storedToken = yield* resolveStoredToken(origin).pipe(
            Effect.provide(storeLayer),
            Effect.catchAll(() => Effect.succeed(Option.none<TokenSource>())),
          );

          // 2. If no stored credentials and this is the default registry, check ambient tokens
          const maybeToken = Option.isSome(storedToken)
            ? storedToken
            : origin === new URL(registryUrl).origin
              ? yield* resolveAmbientToken(flagToken)
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
              ).pipe(Effect.catchAll(() => Effect.void));
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
              ).pipe(Effect.catchAll(() => Effect.void));
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
