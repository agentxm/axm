/**
 * Auth middleware — the one place a request acquires a credential.
 *
 * Every outgoing request to a Registry origin is presented with whatever
 * credential the invocation resolved: an ambient token, a `--token` flag, or
 * the stored session. A stored session is renewed here — before the request
 * when it is about to expire, and again if the Registry rejects it — through
 * the single `SessionRefresher` authority.
 *
 * A request that already carries an `Authorization` header is left exactly as
 * its caller built it. That is how a sign-in flow reads the identity of a
 * token the store does not hold yet, and it keeps the ambient rule simple:
 * this layer supplies a credential, it never replaces one.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as HttpClient from "effect/unstable/http/HttpClient";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import * as HttpClientError from "effect/unstable/http/HttpClientError";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";

import { CredentialStore } from "../credentials/credential-store.js";
import { SessionRefresher, type SessionRefreshError } from "../credentials/session-refresh.js";
import { RegistryUrl } from "@agentxm/registry-client";
import type { CredentialStoreTokenSource, TokenSource } from "../credentials/schema.js";
import { resolveRequestToken } from "../credentials/token-resolution.js";

// -----------------------------------------------------------------------------
// AuthMiddleware layer
// -----------------------------------------------------------------------------

/**
 * Creates an auth middleware layer that presents the invocation's credential
 * and keeps a stored session alive.
 *
 * The `flagToken` parameter allows per-command --token flag injection.
 */
export const makeAuthMiddlewareLive = (flagToken?: string) =>
  Layer.effect(
    HttpClient.HttpClient,
    Effect.gen(function* () {
      const baseClient = yield* HttpClient.HttpClient;
      const store = yield* CredentialStore;
      const refresher = yield* SessionRefresher;
      const fs = yield* Effect.serviceOption(FileSystem.FileSystem);
      const defaultRegistryUrl = yield* RegistryUrl;
      const storeLayerBase = Layer.succeed(CredentialStore, store);
      const storeLayer = Option.match(fs, {
        onNone: () => storeLayerBase,
        onSome: (fileSystem) =>
          Layer.merge(storeLayerBase, Layer.succeed(FileSystem.FileSystem, fileSystem)),
      });

      /**
       * A session the Registry ended leaves the request to be answered by the
       * Registry itself: it rejects the stale credential and the caller renders
       * the one signed-out result. A Registry that could not be reached is a
       * transport failure and says so, rather than arriving as a rejected
       * credential the caller would read as being signed out.
       */
      const presentableToken = (credential: CredentialStoreTokenSource) =>
        Effect.matchEffect(refresher.fresh(credential), {
          onFailure: (error: SessionRefreshError) =>
            error._tag === "RefreshUnavailable" ? Effect.fail(error) : Effect.succeed(credential),
          onSuccess: Effect.succeed,
        });

      const asTransportFailure =
        (request: HttpClientRequest.HttpClientRequest) => (error: SessionRefreshError) =>
          new HttpClientError.HttpClientError({
            reason: new HttpClientError.TransportError({
              request,
              cause: error,
              description: "The session could not be renewed.",
            }),
          });

      return HttpClient.make((request) =>
        Effect.gen(function* () {
          if (request.headers["authorization"] !== undefined) {
            return yield* baseClient.execute(request);
          }

          const maybeToken = yield* resolveRequestToken(
            request.url,
            defaultRegistryUrl,
            flagToken,
          ).pipe(
            Effect.provide(storeLayer),
            Effect.tapError((e) => Effect.logDebug("Token resolution failed", { error: e })),
            Effect.catch(() => Effect.succeed(Option.none<TokenSource>())),
          );

          if (Option.isNone(maybeToken)) {
            return yield* baseClient.execute(request);
          }

          const tokenSource = maybeToken.value;
          if (tokenSource._tag !== "CredentialStore") {
            return yield* baseClient.execute(
              HttpClientRequest.bearerToken(request, tokenSource.token),
            );
          }

          const current = yield* presentableToken(tokenSource).pipe(
            Effect.mapError(asTransportFailure(request)),
          );
          const response = yield* baseClient.execute(
            HttpClientRequest.bearerToken(request, current.token),
          );
          if (response.status !== 401) return response;

          const renewed = yield* Effect.matchEffect(refresher.renew(current), {
            onFailure: (error: SessionRefreshError) =>
              error._tag === "RefreshUnavailable"
                ? Effect.fail(asTransportFailure(request)(error))
                : Effect.succeed(Option.none<CredentialStoreTokenSource>()),
            onSuccess: (credential) => Effect.succeed(Option.some(credential)),
          });

          return Option.isNone(renewed)
            ? response
            : yield* baseClient.execute(
                HttpClientRequest.bearerToken(request, renewed.value.token),
              );
        }),
      );
    }),
  );

/**
 * Default auth middleware layer (no --token flag).
 */
export const AuthMiddlewareLive = makeAuthMiddlewareLive();
