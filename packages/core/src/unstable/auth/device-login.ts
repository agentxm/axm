/**
 * Shared device-code login flow for auth commands and guards.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as ServiceMap from "effect/Context";
import * as Layer from "effect/Layer";

import { makeAppError } from "../app-error/index.js";
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
  expiresInSeconds: number,
  options: RunDeviceLoginOptions,
) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const interaction = yield* DeviceLoginInteraction;

    const shouldOpenBrowser = options.openBrowser ?? true;
    const copiedToClipboard = yield* interaction.copyToClipboard(userCode);
    if (shouldOpenBrowser) {
      const openedBrowser = yield* interaction.openBrowser(verificationUri);
      if (openedBrowser) {
        yield* renderer.info("Opening your browser to complete device authorization.");
      }
    }

    const expiry =
      expiresInSeconds % 60 === 0
        ? `${expiresInSeconds / 60} ${expiresInSeconds === 60 ? "minute" : "minutes"}`
        : `${expiresInSeconds} seconds`;
    yield* renderer.instruction("Sign in to AgentXM.ai with a one-time code");
    yield* renderer.suggestions([
      {
        description: "Open the AXM device authorization page",
        url: verificationUri,
      },
    ]);
    if (copiedToClipboard) {
      yield* renderer.info("The one-time code was copied to your clipboard.");
    }
    yield* renderer.instruction(`One-time code:\n\n   ${userCode}`);
    yield* renderer.instruction(`This code expires in ${expiry}.`);
    yield* renderer.instruction("Only continue if you started this sign-in with AXM.");
    yield* renderer.instruction(
      "Never enter a code that another person or website gave you. If that happened, cancel.",
    );
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

    yield* presentDeviceFlow(
      deviceFlow.verification_uri,
      deviceFlow.user_code,
      deviceFlow.expires_in,
      options,
    );

    const token = yield* renderer
      .withSpinner(
        "Waiting for authorization…",
        () => authClient.pollDeviceToken(deviceFlow.device_code, deviceFlow.interval),
        { successMessage: `Authorized device on ${registryHost}` },
      )
      .pipe(
        Effect.mapError((error) =>
          error._tag !== "AppError"
            ? error
            : error.detail === "Login code expired"
              ? makeAppError({
                  code: "auth",
                  detail: `This sign-in code expired after ${
                    deviceFlow.expires_in % 60 === 0
                      ? `${deviceFlow.expires_in / 60} ${
                          deviceFlow.expires_in === 60 ? "minute" : "minutes"
                        }`
                      : `${deviceFlow.expires_in} seconds`
                  }. Run \`axm login --device-code\` to request a new code.`,
                  suggestions: [
                    {
                      description: "Request a new device sign-in code.",
                      cmd: "axm login --device-code",
                    },
                  ],
                  cause: error,
                })
              : error.detail === "Login was denied or cancelled"
                ? makeAppError({
                    code: "auth",
                    detail: "Sign-in was cancelled. No credentials were changed.",
                    suggestions: [
                      {
                        description: "Try signing in again.",
                        cmd: "axm login --device-code",
                      },
                    ],
                    cause: error,
                  })
                : error,
        ),
      );

    const handle = yield* renderer.withSpinner(
      `Saving credentials for ${registryHost}`,
      () => persistLoginCredentials(registryUrl, token),
      { successMessage: `Saved credentials for ${registryHost}` },
    );

    yield* emitLoginSuccess(registryUrl, handle);
  });
