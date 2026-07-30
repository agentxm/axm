/**
 * Authorization Code + PKCE login over a loopback redirect.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { createHash, randomBytes } from "node:crypto";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { CliRenderer } from "../cli-renderer/index.js";
import { normalizeHandle } from "../extensions/handle.js";

import { AuthClient } from "./auth-client.js";
import { CredentialStore, makePersistedCredentialsUnsupportedError } from "./credential-store.js";
import { DeviceLoginInteraction } from "./device-login.js";
import { emitLoginSuccess } from "./login-output.js";
import {
  LoopbackCallbackRejected,
  LoopbackLoginFallback,
  startLoopbackServer,
} from "./loopback-server.js";
import type { NormalizedTokenResponse } from "./oauth-contract.js";

const UNKNOWN_HANDLE = normalizeHandle("@unknown");
// Human approval window for the browser/login round trip. The issued
// authorization code remains shorter-lived on the registry side.
const LOOPBACK_TIMEOUT = Duration.minutes(5);

export interface RunLoopbackLoginOptions {
  readonly scopes?: ReadonlyArray<string>;
}

export const makePkceVerifier = (): string => randomBytes(64).toString("base64url");

export const makePkceChallenge = (verifier: string): string =>
  createHash("sha256").update(verifier).digest("base64url");

export const makeOAuthState = (): string => randomBytes(32).toString("base64url");

const persistLoginCredentials = (registryUrl: string, token: NormalizedTokenResponse) =>
  Effect.gen(function* () {
    const authClient = yield* AuthClient;
    const credStore = yield* CredentialStore;

    const meResult = yield* authClient
      .getMe(token.access_token)
      .pipe(Effect.retry({ times: 1 }), Effect.option);
    const handle = Option.match(meResult, {
      onNone: () => UNKNOWN_HANDLE,
      onSome: (me) => me.userHandle,
    });

    yield* credStore.save(registryUrl, handle, {
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      expires_at: token.expires_at,
    });

    return Option.map(meResult, (me) => me.userHandle);
  });

export const runLoopbackLogin = (registryUrl: string, options: RunLoopbackLoginOptions = {}) =>
  Effect.gen(function* () {
    const authClient = yield* AuthClient;
    const credStore = yield* CredentialStore;
    const renderer = yield* CliRenderer;
    const interaction = yield* DeviceLoginInteraction;
    const registryHost = new URL(registryUrl).host;

    if (!credStore.allowsPersistedCredentials) {
      return yield* makePersistedCredentialsUnsupportedError();
    }

    const verifier = makePkceVerifier();
    const challenge = makePkceChallenge(verifier);
    const state = makeOAuthState();
    const server = yield* startLoopbackServer();
    const authorizeUrl = authClient.buildAuthorizeUrl({
      challenge,
      expiresAt: DateTime.addDuration(yield* DateTime.now, LOOPBACK_TIMEOUT),
      state,
      redirectUri: server.redirectUri,
      ...(options.scopes === undefined ? {} : { scopes: options.scopes }),
    });

    const openedBrowser = yield* interaction.openBrowser(authorizeUrl);
    if (!openedBrowser) {
      yield* server.close;
      return yield* new LoopbackLoginFallback({
        reason: "browser_unavailable",
        message: "Could not open the system browser.",
      });
    }

    yield* renderer.step("Opening browser to sign in...");

    const callback = yield* renderer.withSpinner(
      `Waiting for browser authorization on ${registryHost}`,
      () => server.awaitCallback(state, Duration.toMillis(LOOPBACK_TIMEOUT)),
      { successMessage: `Received browser authorization on ${registryHost}` },
    );
    const expectedIssuer = authClient.getAuthorizationIssuer();
    if (callback.iss !== expectedIssuer) {
      return yield* new LoopbackCallbackRejected({
        reason: "invalid_callback",
        message: "Authorization callback issuer did not match.",
      });
    }

    const handle = yield* renderer.withSpinner(
      `Completing sign-in to ${registryHost}`,
      () =>
        Effect.gen(function* () {
          const token = yield* authClient.exchangePkceCode({
            code: callback.code,
            verifier,
            redirectUri: server.redirectUri,
          });
          return yield* persistLoginCredentials(registryUrl, token);
        }),
      { successMessage: `Completed sign-in to ${registryHost}` },
    );
    yield* emitLoginSuccess(registryUrl, handle);
  });
