import { createHash } from "node:crypto";
import * as Effect from "effect/Effect";

import type { AppError } from "../app-error/index.js";
import { makeAppError } from "../app-error/index.js";
import { CliRenderer } from "../cli-renderer/index.js";
import type { ExtensionName, ExtensionType } from "../extensions/index.js";
import type { Handle } from "../extensions/handle.js";
import type { Version } from "../version-constraints/version-constraints.js";
import { AuthClient } from "./auth-client.js";
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
  readonly owner: Handle;
  readonly type: ExtensionType;
  readonly name: ExtensionName;
  readonly version: Version;
  readonly archive: Uint8Array;
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
  const authClient = yield* AuthClient;
  const renderer = yield* CliRenderer;
  const interaction = yield* DeviceLoginInteraction;
  const verifier = makePkceVerifier();
  const challenge = makePkceChallenge(verifier);
  const state = makeOAuthState();
  const archiveSha256 = createHash("sha256").update(input.archive).digest("hex");
  const server = yield* startLoopbackServer().pipe(Effect.mapError(loopbackFailureToAppError));

  const request = yield* authClient
    .createPublishAuthorizationRequest({
      registryUrl: input.registryUrl,
      redirectUri: server.redirectUri,
      state,
      codeChallenge: challenge,
      owner: input.owner,
      type: input.type,
      name: input.name,
      version: input.version,
      archiveSha256,
    })
    .pipe(Effect.tapError(() => server.close));

  const openedBrowser = yield* interaction.openBrowser(request.authorizationUrl);
  yield* renderer.step(
    openedBrowser
      ? `Opening browser to review ${input.owner}/${input.type}/${input.name}@${input.version}...`
      : `Open this URL to review the exact publish: ${request.authorizationUrl}`,
  );

  const callback = yield* server
    .awaitCallback(state, PUBLISH_AUTHORIZATION_TIMEOUT_MS)
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

  return capability.accessToken;
});
