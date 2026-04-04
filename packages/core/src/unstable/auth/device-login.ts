/**
 * Shared device-code login flow for auth commands and guards.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as ServiceMap from "effect/ServiceMap";
import * as Layer from "effect/Layer";

import { CliRenderer } from "../cli-renderer/index.js";
import { normalizeHandle } from "../extensions/handle.js";

import { type TokenResponse, AuthClient } from "./auth-client.js";
import { CredentialStore, makePersistedCredentialsUnsupportedError } from "./credential-store.js";

// -----------------------------------------------------------------------------
// DeviceLoginInteraction service — platform integration abstraction
// -----------------------------------------------------------------------------

export interface DeviceLoginInteractionService {
  readonly openBrowser: (url: string) => Effect.Effect<boolean>;
  readonly copyToClipboard: (text: string) => Effect.Effect<boolean>;
}

export class DeviceLoginInteraction extends ServiceMap.Service<
  DeviceLoginInteraction,
  DeviceLoginInteractionService
>()("@axm.sh/core/DeviceLoginInteraction") {}

// -----------------------------------------------------------------------------
// Test layer factory
// -----------------------------------------------------------------------------

export interface DeviceLoginInteractionTestState {
  readonly openBrowserCalls: Array<string>;
  readonly copyToClipboardCalls: Array<string>;
}

export const DeviceLoginInteractionTest = (overrides?: {
  readonly openBrowser?: (url: string) => Effect.Effect<boolean>;
  readonly copyToClipboard?: (text: string) => Effect.Effect<boolean>;
}) => {
  const state: DeviceLoginInteractionTestState = {
    openBrowserCalls: [],
    copyToClipboardCalls: [],
  };

  const layer = Layer.succeed(DeviceLoginInteraction, {
    openBrowser: (url) =>
      Effect.gen(function* () {
        state.openBrowserCalls.push(url);
        return yield* overrides?.openBrowser?.(url) ?? Effect.succeed(false);
      }),
    copyToClipboard: (text) =>
      Effect.gen(function* () {
        state.copyToClipboardCalls.push(text);
        return yield* overrides?.copyToClipboard?.(text) ?? Effect.succeed(false);
      }),
  } satisfies DeviceLoginInteractionService);

  return { layer, state };
};

// -----------------------------------------------------------------------------
// Device login orchestration
// -----------------------------------------------------------------------------

const UNKNOWN_HANDLE = normalizeHandle("@unknown");

const persistLoginCredentials = (registryUrl: string, token: TokenResponse) =>
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

const presentDeviceFlow = (verificationUrl: string, userCode: string) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const interaction = yield* DeviceLoginInteraction;

    // Copy to clipboard first so code is ready before browser loads
    const copiedToClipboard = yield* interaction.copyToClipboard(userCode);
    const openedBrowser = yield* interaction.openBrowser(verificationUrl);

    if (openedBrowser) {
      yield* renderer.step("Opening browser to sign in...");
      yield* renderer.message(verificationUrl);
    } else {
      yield* renderer.step(`Open this URL in your browser: ${verificationUrl}`);
    }

    const clipboardHint = copiedToClipboard ? " (copied to clipboard)" : "";
    yield* renderer.step(`Your verification code: ${userCode}${clipboardHint}`);
  });

export const runDeviceLogin = (registryUrl: string) =>
  Effect.gen(function* () {
    const authClient = yield* AuthClient;
    const credStore = yield* CredentialStore;
    const renderer = yield* CliRenderer;

    if (!credStore.allowsPersistedCredentials) {
      return yield* makePersistedCredentialsUnsupportedError();
    }

    const deviceFlow = yield* authClient.initiateDeviceFlow();
    const verificationUrl = deviceFlow.verification_uri_complete ?? deviceFlow.verification_uri;

    yield* presentDeviceFlow(verificationUrl, deviceFlow.user_code);

    const token = yield* renderer.withSpinner("Waiting for approval in browser...", () =>
      authClient.pollDeviceToken(deviceFlow.device_code, deviceFlow.interval),
    );

    const handle = yield* persistLoginCredentials(registryUrl, token);

    const registryHost = new URL(registryUrl).host;
    yield* Option.match(handle, {
      onNone: () => renderer.success(`Logged in to ${registryHost}.`),
      onSome: (userHandle) => renderer.success(`Logged in to ${registryHost} as ${userHandle}.`),
    });
  });
