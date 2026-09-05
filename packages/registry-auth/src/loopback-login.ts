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

import { normalizeHandle } from "@agentxm/extension-model/unstable/extensions/handle";

import { AuthClient } from "./auth-client.js";
import { CredentialStore, makePersistedCredentialsUnsupportedError } from "./credential-store.js";
import { DeviceLoginInteraction } from "./device-login.js";
import { emitLoginSuccess } from "./login-output.js";
import { AuthLoginPresenter } from "./login-presenter.js";
import { LoopbackCallbackRejected, startLoopbackServer } from "./loopback-server.js";
import type { NormalizedTokenResponse } from "./oauth-contract.js";

const UNKNOWN_HANDLE = normalizeHandle("@unknown");
// Human approval window for the browser/login round trip. The issued
// authorization code remains shorter-lived on the registry side.
const LOOPBACK_TIMEOUT_MINUTES = 5;
const LOOPBACK_TIMEOUT = Duration.minutes(LOOPBACK_TIMEOUT_MINUTES);

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
  Effect.scoped(
    Effect.gen(function* () {
      const authClient = yield* AuthClient;
      const credStore = yield* CredentialStore;
      const presenter = yield* AuthLoginPresenter;
      const interaction = yield* DeviceLoginInteraction;
      const registryHost = new URL(registryUrl).host;

      if (!credStore.allowsPersistedCredentials) {
        return yield* makePersistedCredentialsUnsupportedError();
      }

      const verifier = makePkceVerifier();
      const challenge = makePkceChallenge(verifier);
      const state = makeOAuthState();
      const server = yield* startLoopbackServer(state);
      const authorizeUrl = authClient.buildAuthorizeUrl({
        challenge,
        expiresAt: DateTime.addDuration(yield* DateTime.now, LOOPBACK_TIMEOUT),
        state,
        redirectUri: server.redirectUri,
        ...(options.scopes === undefined ? {} : { scopes: options.scopes }),
      });

      yield* presenter.presentLoopbackStart({
        redirectUri: server.redirectUri,
        authorizeUrl,
      });
      const openedBrowser = yield* interaction.openBrowser(authorizeUrl);
      yield* presenter.noteLoopbackBrowserOutcome(openedBrowser);

      const callback = yield* presenter.withProgress(
        {
          _tag: "WaitingForLoopbackAuthorization",
          registryHost,
          timeoutMinutes: LOOPBACK_TIMEOUT_MINUTES,
        },
        () => server.awaitCallback(Duration.toMillis(LOOPBACK_TIMEOUT)),
      );
      const expectedIssuer = authClient.getAuthorizationIssuer();
      if (callback.iss !== expectedIssuer) {
        return yield* new LoopbackCallbackRejected({
          reason: "invalid_callback",
          message: "Authorization callback issuer did not match.",
        });
      }

      const handle = yield* presenter.withProgress({ _tag: "CompletingSignIn", registryHost }, () =>
        Effect.gen(function* () {
          const token = yield* authClient.exchangePkceCode({
            code: callback.code,
            verifier,
            redirectUri: server.redirectUri,
          });
          return yield* persistLoginCredentials(registryUrl, token);
        }),
      );
      yield* emitLoginSuccess(registryUrl, handle);
    }),
  );
