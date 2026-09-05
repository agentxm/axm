/**
 * Auth middleware — HttpClient wrapping layer.
 *
 * Intercepts outgoing HTTP requests to inject Bearer tokens and handle
 * automatic refresh on 401.
 *
 * Layer composition: wraps the base HttpClient so all downstream consumers
 * get auth headers automatically for registry URLs.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as HttpClient from "effect/unstable/http/HttpClient";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Semaphore from "effect/Semaphore";

import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";

import { AuthClient } from "./auth-client.js";
import { CredentialStore } from "./credential-store.js";
import { RegistryUrl } from "@agentxm/registry-client";
import type { CredentialStoreTokenSource, TokenSource } from "./schema.js";
import { refreshStoredToken, resolveRequestToken, resolveStoredToken } from "./token-resolution.js";

// -----------------------------------------------------------------------------
// AuthMiddleware layer
// -----------------------------------------------------------------------------

/**
 * Creates an auth middleware layer that wraps HttpClient with token injection
 * and automatic refresh on 401.
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
      const fs = yield* Effect.serviceOption(FileSystem.FileSystem);
      const defaultRegistryUrl = yield* RegistryUrl;
      const authLayerBase = Layer.mergeAll(
        Layer.succeed(CredentialStore, store),
        Layer.succeed(AuthClient, authClient),
      );
      const authLayer = Option.match(fs, {
        onNone: () => authLayerBase,
        onSome: (fileSystem) =>
          Layer.merge(authLayerBase, Layer.succeed(FileSystem.FileSystem, fileSystem)),
      });
      const refreshLocks = yield* Ref.make(new Map<string, Semaphore.Semaphore>());
      const refreshOutcomes = yield* Ref.make(
        new Map<
          string,
          {
            readonly attemptedToken: string;
            readonly result: Option.Option<CredentialStoreTokenSource>;
          }
        >(),
      );

      const getRefreshLock = (registryUrl: string) =>
        Ref.modify(refreshLocks, (current) => {
          const existing = current.get(registryUrl);
          if (existing !== undefined) return [existing, current];
          const created = Semaphore.makeUnsafe(1);
          const updated = new Map(current);
          updated.set(registryUrl, created);
          return [created, updated];
        });

      const refreshAfterUnauthorized = (tokenSource: CredentialStoreTokenSource) =>
        Effect.gen(function* () {
          const lock = yield* getRefreshLock(tokenSource.registryUrl);
          return yield* lock.withPermits(1)(
            Effect.gen(function* () {
              const latest = yield* resolveStoredToken(tokenSource.registryUrl).pipe(
                Effect.provide(authLayer),
                Effect.catch(() => Effect.succeed(Option.none<CredentialStoreTokenSource>())),
              );
              if (Option.isNone(latest)) return latest;
              if (latest.value.token !== tokenSource.token) return latest;

              const outcomes = yield* Ref.get(refreshOutcomes);
              const previous = outcomes.get(tokenSource.registryUrl);
              if (previous?.attemptedToken === tokenSource.token) return previous.result;

              const result = yield* refreshStoredToken(latest.value).pipe(
                Effect.provide(authLayer),
                Effect.option,
              );
              yield* Ref.update(refreshOutcomes, (current) => {
                const updated = new Map(current);
                updated.set(tokenSource.registryUrl, {
                  attemptedToken: tokenSource.token,
                  result,
                });
                return updated;
              });
              return result;
            }),
          );
        });

      return HttpClient.make((request) =>
        Effect.gen(function* () {
          const maybeToken = yield* resolveRequestToken(
            request.url,
            defaultRegistryUrl,
            flagToken,
          ).pipe(
            Effect.provide(authLayer),
            Effect.tapError((e) => Effect.logDebug("Token resolution failed", { error: e })),
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
            const refreshResult = yield* refreshAfterUnauthorized(tokenSource);

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
