/**
 * Shared device-code login flow for auth commands and guards.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as ServiceMap from "effect/Context";
import * as Layer from "effect/Layer";

import { makeAppError } from "../app-error/index.js";
import { CliRenderer } from "../cli-renderer/index.js";
import { normalizeHandle } from "@agentxm/extension-model/unstable/extensions/handle";

import { AuthClient, normalizeRequestedLoginScopes } from "./auth-client.js";
import { CredentialStore, makePersistedCredentialsUnsupportedError } from "./credential-store.js";
import { emitLoginSuccess } from "./login-output.js";
import type { NormalizedTokenResponse } from "./oauth-contract.js";
import { PendingDeviceLoginStore, type PendingDeviceLogin } from "./pending-device-login-store.js";

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
>()("@agentxm/extension-management/unstable/auth/device-login/DeviceLoginInteraction") {}

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
  readonly emitPendingResult?: boolean;
  readonly openBrowser?: boolean;
  readonly restart?: boolean;
  readonly scopes?: ReadonlyArray<string>;
}

export interface ResumeDeviceLoginOptions {
  readonly timeoutSeconds?: number;
}

const DeviceLoginActionSchema = Schema.Struct({
  kind: Schema.Literal("open-url"),
  url: Schema.String,
  fallbackUrl: Schema.String,
  code: Schema.String,
  expiresAt: Schema.String,
  resume: Schema.String,
});

export const DeviceLoginPendingResultSchema = Schema.Struct({
  status: Schema.Literal("pending-human"),
  blockedOn: Schema.Literal("human"),
  retryable: Schema.Literal(true),
  flow: Schema.Literals(["started", "re-emitted"]),
  registryHost: Schema.String,
  verificationUri: Schema.String,
  verificationUriComplete: Schema.String,
  requestedScopes: Schema.Array(Schema.String),
  userCode: Schema.String,
  expiresAt: Schema.String,
  interval: Schema.Number,
  resume: Schema.String,
  action: DeviceLoginActionSchema,
});

export type DeviceLoginPendingResult = typeof DeviceLoginPendingResultSchema.Type;

const DeviceLoginPendingDocumentSchema = Schema.Struct({
  result: DeviceLoginPendingResultSchema,
});

const presentDeviceFlow = (
  verificationUri: string,
  verificationUriComplete: string,
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
      const openedBrowser = yield* interaction.openBrowser(verificationUriComplete);
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
        url: verificationUriComplete,
      },
      {
        description: "Open the clean fallback page and enter the code",
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

const makePendingResult = (
  pending: PendingDeviceLogin,
  flow: DeviceLoginPendingResult["flow"] = "started",
): DeviceLoginPendingResult => {
  const registryHost = new URL(pending.registryUrl).host;
  const expiresAt = DateTime.formatIso(pending.expiresAt);
  const resume = "axm login --wait --json";
  return {
    status: "pending-human",
    blockedOn: "human",
    retryable: true,
    flow,
    registryHost,
    verificationUri: pending.verificationUri,
    verificationUriComplete: pending.verificationUriComplete,
    requestedScopes: pending.requestedScopes,
    userCode: pending.userCode,
    expiresAt,
    interval: pending.interval,
    resume,
    action: {
      kind: "open-url",
      url: pending.verificationUriComplete,
      fallbackUrl: pending.verificationUri,
      code: pending.userCode,
      expiresAt,
      resume,
    },
  };
};

const emitPendingDeviceLogin = (
  pending: PendingDeviceLogin,
  options: RunDeviceLoginOptions,
  flow: DeviceLoginPendingResult["flow"] = "started",
) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const result = makePendingResult(pending, flow);
    const suggestions = [
      {
        description: "Open the AXM device authorization page",
        url: pending.verificationUriComplete,
      },
      {
        description: "Open the clean fallback page and enter the code",
        url: pending.verificationUri,
      },
      {
        description: "Resume after approval",
        cmd: "axm login --wait --json",
      },
    ];
    if (
      yield* renderer.result({ result }, DeviceLoginPendingDocumentSchema, {
        suggestions,
      })
    ) {
      return result;
    }
    yield* presentDeviceFlow(
      pending.verificationUri,
      pending.verificationUriComplete,
      pending.userCode,
      Math.max(
        0,
        Math.ceil(
          (DateTime.toEpochMillis(pending.expiresAt) -
            DateTime.toEpochMillis(yield* DateTime.now)) /
            1000,
        ),
      ),
      options,
    );
    yield* renderer.success("Device sign-in is waiting for approval.", { suggestions });
    return result;
  });

export const initiateDeviceLogin = (registryUrl: string, options: RunDeviceLoginOptions = {}) =>
  Effect.gen(function* () {
    const authClient = yield* AuthClient;
    const credStore = yield* CredentialStore;
    const pendingStore = yield* PendingDeviceLoginStore;
    const renderer = yield* CliRenderer;
    const registryHost = new URL(registryUrl).host;
    const requestedScopes = normalizeRequestedLoginScopes(options.scopes);

    if (!credStore.allowsPersistedCredentials) {
      return yield* makePersistedCredentialsUnsupportedError();
    }

    const existing = yield* pendingStore.load();
    if (Option.isSome(existing)) {
      const expired = yield* DateTime.isPast(existing.value.expiresAt);
      if (expired || options.restart === true) {
        yield* pendingStore.clear();
      } else if (
        existing.value.registryUrl === registryUrl &&
        existing.value.requestedScopes.length === requestedScopes.length &&
        existing.value.requestedScopes.every((scope, index) => scope === requestedScopes[index])
      ) {
        return yield* emitPendingDeviceLogin(existing.value, options, "re-emitted");
      } else {
        return yield* makeAppError({
          code: "conflict",
          detail:
            existing.value.registryUrl === registryUrl
              ? `A device sign-in for ${registryHost} is already pending with a different scope set.`
              : `A device sign-in for ${new URL(existing.value.registryUrl).host} is already pending.`,
          suggestions: [
            {
              description: "Finish the pending sign-in before starting another.",
              cmd: "axm login --wait --json",
            },
            {
              description: "Replace the pending sign-in intentionally.",
              cmd: "axm login --device-code --restart --json",
            },
          ],
        });
      }
    }

    const deviceFlow = yield* renderer.withSpinner(
      `Starting device authorization for ${registryHost}`,
      () => authClient.initiateDeviceFlow({ scopes: requestedScopes }),
      { successMessage: `Started device authorization for ${registryHost}` },
    );

    const pending: PendingDeviceLogin = {
      version: 2,
      registryUrl,
      deviceCode: deviceFlow.device_code,
      userCode: deviceFlow.user_code,
      verificationUri: deviceFlow.verification_uri,
      verificationUriComplete: deviceFlow.verification_uri_complete,
      requestedScopes,
      interval: deviceFlow.interval,
      expiresAt: DateTime.add(yield* DateTime.now, { seconds: deviceFlow.expires_in }),
    };
    yield* pendingStore.save(pending);
    if (options.emitPendingResult === false) {
      yield* presentDeviceFlow(
        pending.verificationUri,
        pending.verificationUriComplete,
        pending.userCode,
        deviceFlow.expires_in,
        options,
      );
      return makePendingResult(pending);
    }
    return yield* emitPendingDeviceLogin(pending, options);
  });

const pendingLoginNotFound = () =>
  makeAppError({
    code: "not_found",
    detail: "No pending device sign-in was found.",
    suggestions: [
      {
        description: "Start a device sign-in first.",
        cmd: "axm login --device-code --json",
      },
    ],
  });

export const resumeDeviceLogin = (registryUrl: string, options: ResumeDeviceLoginOptions = {}) =>
  Effect.gen(function* () {
    const authClient = yield* AuthClient;
    const credStore = yield* CredentialStore;
    const pendingStore = yield* PendingDeviceLoginStore;
    const renderer = yield* CliRenderer;
    const registryHost = new URL(registryUrl).host;

    if (!credStore.allowsPersistedCredentials) {
      return yield* makePersistedCredentialsUnsupportedError();
    }

    const loaded = yield* pendingStore.load();
    if (Option.isNone(loaded)) return yield* pendingLoginNotFound();
    const pending = loaded.value;
    if (pending.registryUrl !== registryUrl) {
      return yield* makeAppError({
        code: "conflict",
        detail: `The pending sign-in belongs to ${new URL(pending.registryUrl).host}, not ${registryHost}.`,
        suggestions: [
          {
            description: "Resume with the registry that started the sign-in.",
            cmd: "axm login --wait --registry <url> --json",
          },
        ],
      });
    }

    if (yield* DateTime.isPast(pending.expiresAt)) {
      yield* pendingStore.clear();
      return yield* makeAppError({
        code: "auth_expired",
        detail: "The pending device sign-in expired. No credentials were changed.",
        suggestions: [
          {
            description: "Request a new device sign-in code.",
            cmd: "axm login --device-code --json",
          },
        ],
      });
    }

    const polling = authClient.pollDeviceToken(pending.deviceCode, pending.interval);
    const boundedPolling =
      options.timeoutSeconds === undefined
        ? polling
        : polling.pipe(
            Effect.timeoutOrElse({
              duration: Duration.seconds(options.timeoutSeconds),
              orElse: () =>
                Effect.fail(
                  makeAppError({
                    code: "timeout",
                    status: "pending-human",
                    retryable: true,
                    blockedOn: "human",
                    action: makePendingResult(pending).action,
                    detail: `Device sign-in did not complete within ${options.timeoutSeconds} seconds. The pending flow is still available.`,
                    suggestions: [
                      {
                        description: "Resume waiting after approval.",
                        cmd: "axm login --wait --json",
                      },
                    ],
                  }),
                ),
            }),
          );

    const token = yield* renderer
      .withSpinner("Waiting for authorization…", () => boundedPolling, {
        successMessage: `Authorized device on ${registryHost}`,
      })
      .pipe(
        Effect.catchTag("AppError", (error) => {
          if (error.detail === "Login code expired") {
            return pendingStore.clear().pipe(
              Effect.flatMap(() =>
                Effect.fail(
                  makeAppError({
                    code: "auth_expired",
                    detail: "The pending device sign-in expired. No credentials were changed.",
                    suggestions: [
                      {
                        description: "Request a new device sign-in code.",
                        cmd: "axm login --device-code --json",
                      },
                    ],
                    cause: error,
                  }),
                ),
              ),
            );
          }
          if (error.detail === "Login was denied or cancelled") {
            return pendingStore.clear().pipe(
              Effect.flatMap(() =>
                Effect.fail(
                  makeAppError({
                    code: "auth_denied",
                    detail: "Device sign-in was denied or cancelled. No credentials were changed.",
                    suggestions: [
                      {
                        description: "Start a new device sign-in when ready.",
                        cmd: "axm login --device-code --json",
                      },
                    ],
                    cause: error,
                  }),
                ),
              ),
            );
          }
          return Effect.fail(error);
        }),
      );

    yield* pendingStore.clear();
    const handle = yield* renderer.withSpinner(
      `Saving credentials for ${registryHost}`,
      () => persistLoginCredentials(registryUrl, token),
      { successMessage: `Saved credentials for ${registryHost}` },
    );

    yield* emitLoginSuccess(registryUrl, handle);
  });

export const runDeviceLogin = (registryUrl: string, options: RunDeviceLoginOptions = {}) =>
  Effect.gen(function* () {
    yield* initiateDeviceLogin(registryUrl, { ...options, emitPendingResult: false });
    yield* resumeDeviceLogin(registryUrl);
  });
