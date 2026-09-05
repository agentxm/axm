import * as Effect from "effect/Effect";

import type { PreviewPublicationSetRequest } from "@agentxm/registry-protocol/unstable/registry/publication-set";
import { RegistryAuthFailed } from "./errors.js";
import { AuthClient, type PublishAuthorizationExchangeResponse } from "./auth-client.js";
import { DeviceLoginInteraction } from "./device-login.js";
import { AuthLoginPresenter } from "./login-presenter.js";
import {
  LoopbackCallbackRejected,
  LoopbackLoginFallback,
  startLoopbackServer,
} from "./loopback-server.js";
import { makeOAuthState, makePkceChallenge, makePkceVerifier } from "./loopback-login.js";

const PUBLISH_AUTHORIZATION_TIMEOUT_MS = 10 * 60_000;

export interface PublishAuthorizationInput {
  readonly registryUrl: string;
  readonly publicationSet: PreviewPublicationSetRequest;
}

const loopbackFailureToAuthFailure = (
  error: LoopbackLoginFallback | LoopbackCallbackRejected,
): RegistryAuthFailed => {
  if (error._tag === "LoopbackCallbackRejected" && error.reason === "access_denied") {
    return new RegistryAuthFailed({
      category: "auth",
      detail: "Publish authorization was denied",
      suggestions: [{ description: "Rerun publish when you are ready to review it again." }],
      cause: error,
    });
  }

  if (error._tag === "LoopbackLoginFallback" && error.reason === "timeout") {
    return new RegistryAuthFailed({
      category: "auth",
      detail: "Publish authorization expired before approval",
      suggestions: [{ description: "Rerun publish to create a new request." }],
      cause: error,
    });
  }

  return new RegistryAuthFailed({
    category: "auth",
    detail: `Publish loopback callback failed: ${error.message}`,
    suggestions: [
      {
        description:
          "Check that local loopback connections to 127.0.0.1 are allowed, then rerun publish.",
      },
    ],
    cause: error,
  });
};

export const runPublishAuthorization = Effect.fn("Auth.runPublishAuthorization")(function* (
  input: PublishAuthorizationInput,
) {
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const authClient = yield* AuthClient;
      const presenter = yield* AuthLoginPresenter;
      const interaction = yield* DeviceLoginInteraction;
      const verifier = makePkceVerifier();
      const challenge = makePkceChallenge(verifier);
      const state = makeOAuthState();
      const server = yield* startLoopbackServer(state).pipe(
        Effect.mapError(loopbackFailureToAuthFailure),
      );

      const request = yield* authClient.createPublishAuthorizationRequest({
        registryUrl: input.registryUrl,
        redirectUri: server.redirectUri,
        state,
        codeChallenge: challenge,
        publicationSet: input.publicationSet,
      });

      const openedBrowser = yield* interaction.openBrowser(request.authorizationUrl);
      yield* presenter.notePublishReview({
        browserOpened: openedBrowser,
        candidateCount: input.publicationSet.candidates.length,
        authorizationUrl: request.authorizationUrl,
      });

      const callback = yield* server
        .awaitCallback(PUBLISH_AUTHORIZATION_TIMEOUT_MS)
        .pipe(Effect.mapError(loopbackFailureToAuthFailure));
      const expectedIssuer = new URL(request.authorizationUrl).origin;
      if (callback.iss !== expectedIssuer) {
        return yield* new RegistryAuthFailed({
          category: "auth",
          detail: "Publish authorization callback issuer did not match",
          cause: { expectedIssuer, receivedIssuer: callback.iss },
        });
      }

      const capability = yield* authClient.exchangePublishAuthorizationCode({
        registryUrl: input.registryUrl,
        code: callback.code,
        verifier,
        redirectUri: server.redirectUri,
      });

      return capability;
    }),
  );
}, Effect.satisfiesSuccessType<PublishAuthorizationExchangeResponse>());
