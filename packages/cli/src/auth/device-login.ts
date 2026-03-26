/**
 * Shared device-code login flow for auth commands and guards.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";

import { type TokenResponse, AuthClient } from "./auth-client.js";
import { CredentialStore } from "./credential-store.js";
import { AuthLoginInteraction } from "./login-interaction.js";

const UNKNOWN_HANDLE = "unknown";

const persistLoginCredentials = (registryUrl: string, token: TokenResponse) =>
  Effect.gen(function* () {
    const authClient = yield* AuthClient;
    const credStore = yield* CredentialStore;

    const meResult = yield* authClient.getMe(registryUrl, token.access_token).pipe(Effect.option);
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

const presentDeviceFlow = (verificationUrl: string, userCode: string) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const interaction = yield* AuthLoginInteraction;

    const openedBrowser = yield* interaction.openBrowser(verificationUrl);
    yield* interaction.copyToClipboard(userCode);

    if (openedBrowser) {
      yield* renderer.step("Opening browser to sign in...");
    } else {
      yield* renderer.step(`Open this URL in your browser: ${verificationUrl}`);
    }

    yield* renderer.step(`Enter code: ${userCode}`);
  });

export const runDeviceLogin = (registryUrl: string) =>
  Effect.gen(function* () {
    const authClient = yield* AuthClient;
    const renderer = yield* CliRenderer;

    const deviceFlow = yield* authClient.initiateDeviceFlow(registryUrl);
    const verificationUrl = deviceFlow.verification_uri_complete ?? deviceFlow.verification_uri;

    yield* presentDeviceFlow(verificationUrl, deviceFlow.user_code);

    const token = yield* renderer.withSpinner("Waiting for approval in browser...", () =>
      authClient.pollDeviceToken(registryUrl, deviceFlow.device_code, deviceFlow.interval),
    );

    const handle = yield* persistLoginCredentials(registryUrl, token);

    yield* Option.match(handle, {
      onNone: () => renderer.success("Login successful."),
      onSome: (userHandle) => renderer.success(`Logged in as ${userHandle}`),
    });
  });
