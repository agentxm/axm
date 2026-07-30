/**
 * Shared device-code login flow for auth commands and guards.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as ServiceMap from "effect/Context";
import * as Layer from "effect/Layer";

import { CliRenderer } from "../cli-renderer/index.js";
import { normalizeHandle } from "../extensions/handle.js";

import { AuthClient } from "./auth-client.js";
import { CredentialStore, makePersistedCredentialsUnsupportedError } from "./credential-store.js";
import { emitLoginSuccess } from "./login-output.js";
import type { NormalizedTokenResponse } from "./oauth-contract.js";

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
>()("@agentxm/client-core/unstable/auth/device-login/DeviceLoginInteraction") {}

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

export interface RunDeviceLoginOptions {
  readonly openBrowser?: boolean;
  readonly scopes?: ReadonlyArray<string>;
}

const presentDeviceFlow = (
  verificationUri: string,
  userCode: string,
  options: RunDeviceLoginOptions,
) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const interaction = yield* DeviceLoginInteraction;

    const shouldOpenBrowser = options.openBrowser ?? true;
    const copiedToClipboard = yield* interaction.copyToClipboard(verificationUri);
    if (shouldOpenBrowser) {
      const openedBrowser = yield* interaction.openBrowser(verificationUri);
      if (openedBrowser) {
        yield* renderer.step("Opening browser to complete device authorization...");
      }
    }

    const clipboardHint = copiedToClipboard ? " (copied to clipboard)" : "";
    yield* renderer.step(`Visit: ${verificationUri}${clipboardHint}`);
    yield* renderer.step(`Code: ${userCode}`);
  });

export const runDeviceLogin = (registryUrl: string, options: RunDeviceLoginOptions = {}) =>
  Effect.gen(function* () {
    const authClient = yield* AuthClient;
    const credStore = yield* CredentialStore;
    const renderer = yield* CliRenderer;
    const registryHost = new URL(registryUrl).host;

    if (!credStore.allowsPersistedCredentials) {
      return yield* makePersistedCredentialsUnsupportedError();
    }

    const deviceFlow = yield* renderer.withSpinner(
      `Starting device authorization for ${registryHost}`,
      () =>
        authClient.initiateDeviceFlow({
          ...(options.scopes === undefined ? {} : { scopes: options.scopes }),
        }),
      { successMessage: `Started device authorization for ${registryHost}` },
    );

    yield* presentDeviceFlow(deviceFlow.verification_uri, deviceFlow.user_code, options);

    const token = yield* renderer.withSpinner(
      `Waiting for device authorization on ${registryHost}`,
      () => authClient.pollDeviceToken(deviceFlow.device_code, deviceFlow.interval),
      { successMessage: `Authorized device on ${registryHost}` },
    );

    const handle = yield* renderer.withSpinner(
      `Saving credentials for ${registryHost}`,
      () => persistLoginCredentials(registryUrl, token),
      { successMessage: `Saved credentials for ${registryHost}` },
    );

    yield* emitLoginSuccess(registryUrl, handle);
  });
