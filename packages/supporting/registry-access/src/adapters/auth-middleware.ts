/**
 * Auth middleware — the one place a request acquires a credential.
 *
 * Every outgoing request to a Registry origin is presented with whatever
 * credential the invocation resolved: an ambient token or the stored session.
 * A stored session is renewed here — before the request when it is about to
 * expire, and again if the Registry rejects it — through the single
 * `SessionRefresher` authority.
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
import {
  REGISTRY_ERROR_CATEGORIES,
  RegistryRequestFailed,
  RegistryUrl,
  type RegistryErrorCategory,
} from "@agentxm/registry-client";
import type { RegistryAccessFailed, SessionEnded } from "../authentication/errors.js";
import type { CredentialStoreTokenSource } from "../credentials/schema.js";
import { resolveRequestToken } from "../credentials/token-resolution.js";

// -----------------------------------------------------------------------------
// Credential failures, in the vocabulary the transport's callers read
// -----------------------------------------------------------------------------

const registryCategory = (category: string): RegistryErrorCategory =>
  REGISTRY_ERROR_CATEGORIES.find((known) => known === category) ?? "internal";

const requestMetadata = (request: HttpClientRequest.HttpClientRequest) =>
  ({ request: { service: "registry", method: request.method, url: request.url } }) as const;

/**
 * The transport can only fail with a transport error, so a failure to supply
 * the request's credential travels as its cause, as a typed registry failure
 * the Registry client hands on unchanged. A caller is told what went wrong
 * with the credential, never that the network might be down.
 */
const asTransportFailure = (
  request: HttpClientRequest.HttpClientRequest,
  description: string,
  failure: RegistryRequestFailed,
) =>
  new HttpClientError.HttpClientError({
    reason: new HttpClientError.TransportError({ request, cause: failure, description }),
  });

/**
 * A credential source the invocation was pointed at — a token file, or the
 * credential store — that could not be read. It keeps the producer's own
 * reason: which file, which store, and what to do about it.
 */
const credentialUnreadable = (
  request: HttpClientRequest.HttpClientRequest,
  error: RegistryAccessFailed,
): RegistryRequestFailed =>
  new RegistryRequestFailed({
    category: registryCategory(error.category),
    detail: error.detail,
    metadata: requestMetadata(request),
    ...(error.suggestions === undefined ? {} : { suggestions: error.suggestions }),
    cause: error,
  });

/** A renewal failure, as the typed registry failure the request's caller receives. */
const sessionRenewalFailure = (
  request: HttpClientRequest.HttpClientRequest,
  error: Exclude<SessionRefreshError, SessionEnded>,
): RegistryRequestFailed => {
  const metadata = requestMetadata(request);
  switch (error._tag) {
    case "RefreshUnavailable":
      return new RegistryRequestFailed({
        category: "network",
        detail: error.detail,
        metadata,
        suggestions: [{ description: "Retry once the Registry is reachable." }],
        cause: error,
      });
    case "RegistryAccessFailed":
      return new RegistryRequestFailed({
        category: registryCategory(error.category),
        detail: `Your session could not be renewed: ${error.detail}`,
        metadata,
        ...(error.suggestions === undefined ? {} : { suggestions: error.suggestions }),
        cause: error,
      });
    case "AuthTokenPolicyRequired":
      return new RegistryRequestFailed({
        category: "auth",
        detail:
          "Your session could not be renewed: persisted credentials are disabled in this environment.",
        metadata,
        suggestions: [
          {
            description:
              "Set AXM_TOKEN_FILE (preferred) or AXM_TOKEN for non-interactive authentication.",
          },
        ],
        cause: error,
      });
  }
};

// -----------------------------------------------------------------------------
// AuthMiddleware layer
// -----------------------------------------------------------------------------

/**
 * The auth middleware layer: presents the invocation's credential and keeps a
 * stored session alive.
 */
export const AuthMiddlewareLive = Layer.effect(
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
     * the one signed-out result. Every other way renewal can fail — a
     * Registry that could not be reached, a lock or a credential store that
     * refused, a renewal that could not be kept — is not being signed out, so
     * the request fails with that reason instead of going out to collect a
     * rejection the caller would read as one.
     */
    const renewed = (
      request: HttpClientRequest.HttpClientRequest,
      renewal: Effect.Effect<CredentialStoreTokenSource, SessionRefreshError>,
    ) =>
      Effect.asSome(renewal).pipe(
        Effect.catchTag("SessionEnded", () =>
          Effect.succeed(Option.none<CredentialStoreTokenSource>()),
        ),
        Effect.mapError((error) =>
          asTransportFailure(
            request,
            "The session could not be renewed.",
            sessionRenewalFailure(request, error),
          ),
        ),
      );

    /**
     * No credential is one answer and a credential that could not be read is
     * another. An invocation with nothing configured and nothing stored reads
     * anonymously. One pointed at a token file it cannot read, or holding a
     * credential store that refuses, fails with that reason: sent without its
     * credential, the request would be answered as if the person were nobody,
     * and a private extension would simply not exist.
     */
    const credentialFor = (request: HttpClientRequest.HttpClientRequest) =>
      resolveRequestToken(request.url, defaultRegistryUrl).pipe(
        Effect.provide(storeLayer),
        Effect.mapError((error) =>
          asTransportFailure(
            request,
            "The credential for this request could not be read.",
            credentialUnreadable(request, error),
          ),
        ),
      );

    return HttpClient.make((request) =>
      Effect.gen(function* () {
        // A request that names its own credential keeps it, and one whose URL
        // has no origin has no credential to look up; the transport reports
        // that URL for what it is.
        if (request.headers["authorization"] !== undefined || !URL.canParse(request.url)) {
          return yield* baseClient.execute(request);
        }

        const maybeToken = yield* credentialFor(request);
        if (Option.isNone(maybeToken)) {
          return yield* baseClient.execute(request);
        }

        const tokenSource = maybeToken.value;
        if (tokenSource._tag !== "CredentialStore") {
          return yield* baseClient.execute(
            HttpClientRequest.bearerToken(request, tokenSource.token),
          );
        }

        const fresh = yield* renewed(request, refresher.fresh(tokenSource));
        const current = Option.getOrElse(fresh, () => tokenSource);
        const response = yield* baseClient.execute(
          HttpClientRequest.bearerToken(request, current.token),
        );
        if (response.status !== 401) return response;

        const again = yield* renewed(request, refresher.renew(current));
        return Option.isNone(again)
          ? response
          : yield* baseClient.execute(HttpClientRequest.bearerToken(request, again.value.token));
      }),
    );
  }),
);
