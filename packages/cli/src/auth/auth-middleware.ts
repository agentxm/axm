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
import * as ServiceMap from "effect/ServiceMap";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";

import { AuthClient } from "./auth-client.js";
import { CredentialStore } from "./credential-store.js";
import type { TokenSource } from "./schema.js";
import { refreshStoredToken, resolveRequestToken } from "./token-resolution.js";

// -----------------------------------------------------------------------------
// RegistryUrl service — configures which URLs are registry URLs
// -----------------------------------------------------------------------------

export class RegistryUrl extends ServiceMap.Service<RegistryUrl, string>()(
  "@axm.sh/cli/RegistryUrl",
) {}

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
      const authClient = yield* AuthClient;
      const defaultRegistryUrl = yield* RegistryUrl;
      const authLayer = Layer.mergeAll(
        Layer.succeed(CredentialStore, store),
        Layer.succeed(AuthClient, authClient),
      );

      return HttpClient.make((request) =>
        Effect.gen(function* () {
          const maybeToken = yield* resolveRequestToken(
            request.url,
            defaultRegistryUrl,
            flagToken,
          ).pipe(
            Effect.provide(authLayer),
            Effect.catch(() => Effect.succeed(Option.none<TokenSource>())),
          );

          if (Option.isNone(maybeToken)) {
            return yield* baseClient.execute(request);
          }

          const tokenSource = maybeToken.value;
          const currentToken = tokenSource.token;

          // Inject Bearer header
          const authedRequest = HttpClientRequest.bearerToken(request, currentToken);
          const response = yield* baseClient.execute(authedRequest);

          // Automatic refresh on 401 (credential store tokens only)
          if (response.status === 401 && tokenSource._tag === "CredentialStore") {
            const refreshResult = yield* refreshStoredToken(tokenSource).pipe(
              Effect.provide(authLayer),
              Effect.option,
            );

            if (Option.isSome(refreshResult)) {
              const retryRequest = HttpClientRequest.bearerToken(
                request,
                refreshResult.value.token,
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
