/**
 * Request authorization — the one place a Registry request acquires a
 * credential.
 *
 * The Registry client factory applies it to the transport of every client it
 * builds for one HTTP(S) Registry; it never wraps the process-wide client, so
 * self-update and artifact downloads never pass through it. A request is
 * presented with the credential the invocation holds for that Registry: an
 * ambient token or the workload token its GitHub Actions identity was
 * exchanged for, when the Registry is the settings-selected default, and
 * otherwise only that Registry's stored session. The transport never
 * exchanges an identity itself: a command that needs a credential resolves it
 * first, and the transport presents the workload token from then on. It is
 * never renewed on a rejection: the Registry refusing it is the answer.
 * A stored session is renewed here — before the request when it is about to
 * expire, and again if the Registry rejects it — through the single
 * `SessionRefresher` authority.
 *
 * Every request must stay at the origin it was authorized for: one addressed
 * elsewhere is refused before any credential is read, and the client below
 * refuses it again at dispatch. A request that already carries an
 * `Authorization` header is left exactly as its caller built it — that is how
 * a sign-in flow reads the identity of a token the store does not hold yet —
 * so this layer supplies a credential, it never replaces one.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as HttpClient from "effect/http/HttpClient";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import * as HttpClientError from "effect/http/HttpClientError";
import * as HttpClientRequest from "effect/http/HttpClientRequest";

import { CredentialStore } from "../credentials/credential-store.js";
import { SessionRefresher, type SessionRefreshError } from "../credentials/session-refresh.js";
import {
  REGISTRY_ERROR_CATEGORIES,
  RegistryContext,
  RegistryRequestAuthorization,
  RegistryRequestFailed,
  type RegistryErrorCategory,
} from "@agentxm/registry-client";
import type { HttpRegistryEndpoint } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import type { RegistryAccessFailed, SessionEnded } from "../authentication/errors.js";
import type { CredentialStoreTokenSource } from "../credentials/schema.js";
import { resolvePresentedToken } from "../credentials/token-resolution.js";
import { WorkloadCredentials } from "../credentials/workload-credentials.js";

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
// Request authorization layer
// -----------------------------------------------------------------------------

/**
 * The selection failed after a client was built for it: the client exists only
 * because the selection succeeded, so this is a broken invariant reported as a
 * typed failure rather than a guess about the default Registry.
 */
const selectionUnavailable = (request: HttpClientRequest.HttpClientRequest, detail: string) =>
  new RegistryRequestFailed({
    category: "internal",
    detail: `The default Registry could not be decided for this request: ${detail}`,
    metadata: requestMetadata(request),
  });

/** The request authorization layer: presents the credential each Registry is owed. */
export const RegistryRequestAuthorizationLive = Layer.effect(
  RegistryRequestAuthorization,
  Effect.gen(function* () {
    const store = yield* CredentialStore;
    const workload = yield* WorkloadCredentials;
    const refresher = yield* SessionRefresher;
    const context = yield* RegistryContext;
    const fs = yield* Effect.serviceOption(FileSystem.FileSystem);
    const storeLayerBase = Layer.merge(
      Layer.succeed(CredentialStore, store),
      Layer.succeed(WorkloadCredentials, workload),
    );
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
    const credentialFor = (
      endpoint: HttpRegistryEndpoint,
      request: HttpClientRequest.HttpClientRequest,
    ) =>
      context.defaultBound.pipe(
        Effect.mapError((error) =>
          asTransportFailure(
            request,
            "The default Registry could not be decided.",
            selectionUnavailable(request, error.detail),
          ),
        ),
        Effect.flatMap((defaultBound) =>
          resolvePresentedToken(endpoint, defaultBound.endpoint).pipe(
            Effect.provide(storeLayer),
            Effect.mapError((error) =>
              asTransportFailure(
                request,
                "The credential for this request could not be read.",
                credentialUnreadable(request, error),
              ),
            ),
          ),
        ),
      );

    const authorize = (endpoint: HttpRegistryEndpoint, client: HttpClient.HttpClient) =>
      HttpClient.make((request) =>
        Effect.gen(function* () {
          // A request addressed outside this Registry, or naming its own
          // credential, gets nothing from here; the client below refuses one
          // that would leave the origin before it is sent.
          if (
            request.headers["authorization"] !== undefined ||
            !URL.canParse(request.url) ||
            new URL(request.url).origin !== endpoint.href
          ) {
            return yield* client.execute(request);
          }

          const maybeToken = yield* credentialFor(endpoint, request);
          if (Option.isNone(maybeToken)) {
            return yield* client.execute(request);
          }

          const tokenSource = maybeToken.value;
          if (tokenSource._tag !== "CredentialStore") {
            return yield* client.execute(HttpClientRequest.bearerToken(request, tokenSource.token));
          }

          const fresh = yield* renewed(request, refresher.fresh(tokenSource));
          const current = Option.getOrElse(fresh, () => tokenSource);
          const response = yield* client.execute(
            HttpClientRequest.bearerToken(request, current.token),
          );
          if (response.status !== 401) return response;

          const again = yield* renewed(request, refresher.renew(current));
          return Option.isNone(again)
            ? response
            : yield* client.execute(HttpClientRequest.bearerToken(request, again.value.token));
        }),
      );

    return { authorize };
  }),
);
