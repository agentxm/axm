import * as Effect from "effect/Effect";

import type { AppError } from "../app-error/index.js";
import { makeAppError } from "../app-error/index.js";
import { CliRenderer } from "../cli-renderer/index.js";
import type { PreviewPublicationSetRequest } from "../registry/publication-set.js";
import { AuthClient, type PublishAuthorizationExchangeResponse } from "./auth-client.js";
import { DeviceLoginInteraction } from "./device-login.js";
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

const loopbackFailureToAppError = (
  error: LoopbackLoginFallback | LoopbackCallbackRejected,
): AppError => {
  if (error._tag === "LoopbackCallbackRejected" && error.reason === "access_denied") {
    return makeAppError({
      code: "auth",
      detail: "Publish authorization was denied",
      suggestions: [{ description: "Rerun publish when you are ready to review it again." }],
      cause: error,
    });
  }

  if (error._tag === "LoopbackLoginFallback" && error.reason === "timeout") {
    return makeAppError({
      code: "auth",
      detail: "Publish authorization expired before approval",
      suggestions: [{ description: "Rerun publish to create a new request." }],
      cause: error,
    });
  }

  return makeAppError({
    code: "auth",
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
      const renderer = yield* CliRenderer;
      const interaction = yield* DeviceLoginInteraction;
      const verifier = makePkceVerifier();
      const challenge = makePkceChallenge(verifier);
      const state = makeOAuthState();
      const server = yield* startLoopbackServer(state).pipe(
        Effect.mapError(loopbackFailureToAppError),
      );

      const request = yield* authClient.createPublishAuthorizationRequest({
        registryUrl: input.registryUrl,
        redirectUri: server.redirectUri,
        state,
        codeChallenge: challenge,
        publicationSet: input.publicationSet,
      });

      const openedBrowser = yield* interaction.openBrowser(request.authorizationUrl);
      yield* renderer.step(
        openedBrowser
          ? `Opening browser to review ${input.publicationSet.candidates.length} publish candidate${input.publicationSet.candidates.length === 1 ? "" : "s"}...`
          : `Open this URL to review the exact publish: ${request.authorizationUrl}`,
      );

      const callback = yield* server
        .awaitCallback(PUBLISH_AUTHORIZATION_TIMEOUT_MS)
        .pipe(Effect.mapError(loopbackFailureToAppError));
      const expectedIssuer = new URL(request.authorizationUrl).origin;
      if (callback.iss !== expectedIssuer) {
        return yield* makeAppError({
          code: "auth",
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
