import { HumanHandoffActionSchema } from "@agentxm/registry-protocol/unstable/human-handoff";
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

import { normalizeHandle } from "@agentxm/extension-model/unstable/extensions/handle";
import {
  DeviceAuthorizationPending,
  RegistryAccessFailed,
  type DeviceWaitEnded,
} from "./errors.js";

import { AuthClient, normalizeRequestedLoginScopes } from "./auth-client.js";
import {
  CredentialStore,
  makePersistedCredentialsUnsupportedError,
} from "../credentials/credential-store.js";
import { emitLoginSuccess } from "./login-output.js";
import { AuthLoginPresenter } from "./login-presenter.js";
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
>()("@agentxm/registry-access/device-login/DeviceLoginInteraction") {}

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
  /**
   * What the invocation that started this sign-in already did for the person,
   * so the wait says whether a browser is open and the code is on the
   * clipboard. A resume of an earlier invocation did neither.
   */
  readonly sideEffects?: DeviceHandoffSideEffects;
}

const DeviceLoginActionSchema = Schema.Struct({
  ...HumanHandoffActionSchema.fields,
  purpose: Schema.Literal("login"),
  fallbackUrl: Schema.String,
  code: Schema.String,
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

export const DeviceLoginPendingDocumentSchema = Schema.Struct({
  result: DeviceLoginPendingResultSchema,
});

/**
 * The side effects that make a device handoff easy to complete: the code on
 * the clipboard, and the verification page in a browser where one may open.
 * What they achieved travels with the handoff so the terminal can say so.
 */
export interface DeviceHandoffSideEffects {
  readonly browserOpened: boolean;
  readonly copiedToClipboard: boolean;
}

const openDeviceHandoff = (
  handoff: { readonly verificationUriComplete: string; readonly userCode: string },
  options: RunDeviceLoginOptions,
): Effect.Effect<DeviceHandoffSideEffects, never, DeviceLoginInteraction> =>
  Effect.gen(function* () {
    const interaction = yield* DeviceLoginInteraction;
    const copiedToClipboard = yield* interaction.copyToClipboard(handoff.userCode);
    const browserOpened =
      (options.openBrowser ?? true)
        ? yield* interaction.openBrowser(handoff.verificationUriComplete)
        : false;
    return { browserOpened, copiedToClipboard };
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
      purpose: "login",
      requestRef: pending.verificationUriComplete,
      registryUrl: pending.registryUrl,
      intervalSeconds: pending.interval,
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
    const presenter = yield* AuthLoginPresenter;
    const result = makePendingResult(pending, flow);
    // Machine mode consumes the pending document; browser/clipboard side
    // effects and human presentation must not run afterwards.
    if (yield* presenter.tryEmitPendingDeviceLogin(result)) {
      return result;
    }
    // Nothing will wait on this invocation, so the code, the links, and the
    // resume command are the whole of what a person is left with.
    yield* openDeviceHandoff(pending, options);
    yield* presenter.notePendingApproval(result);
    return result;
  });

export const initiateDeviceLogin = (registryUrl: string, options: RunDeviceLoginOptions = {}) =>
  Effect.gen(function* () {
    const authClient = yield* AuthClient;
    const credStore = yield* CredentialStore;
    const pendingStore = yield* PendingDeviceLoginStore;
    const presenter = yield* AuthLoginPresenter;
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
        // A caller that is about to wait takes the pending sign-in as it
        // stands; the wait shows it, so nothing is re-presented here.
        return options.emitPendingResult === false
          ? makePendingResult(existing.value, "re-emitted")
          : yield* emitPendingDeviceLogin(existing.value, options, "re-emitted");
      } else {
        return yield* new RegistryAccessFailed({
          category: "conflict",
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

    const deviceFlow = yield* presenter.withProgress(
      { _tag: "StartingDeviceAuthorization", registryHost },
      () => authClient.initiateDeviceFlow({ scopes: requestedScopes }),
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
    // The caller is about to wait on this sign-in: the wait itself shows the
    // code and the links, so nothing is presented here.
    if (options.emitPendingResult === false) return makePendingResult(pending);
    return yield* emitPendingDeviceLogin(pending, options);
  });

const pendingLoginNotFound = () =>
  new RegistryAccessFailed({
    category: "not_found",
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
    const presenter = yield* AuthLoginPresenter;
    const registryHost = new URL(registryUrl).host;

    if (!credStore.allowsPersistedCredentials) {
      return yield* makePersistedCredentialsUnsupportedError();
    }

    const loaded = yield* pendingStore.load();
    if (Option.isNone(loaded)) return yield* pendingLoginNotFound();
    const pending = loaded.value;
    if (pending.registryUrl !== registryUrl) {
      return yield* new RegistryAccessFailed({
        category: "conflict",
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
      return yield* new RegistryAccessFailed({
        category: "auth_expired",
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
    // The sign-in itself is untouched by how the terminal stopped waiting, so
    // both endings resolve to the same pending outcome and the same resume.
    const stillPending = (waitEnded: DeviceWaitEnded) => {
      const action = makePendingResult(pending).action;
      return new DeviceAuthorizationPending({
        waitEnded,
        registryUrl: pending.registryUrl,
        intervalSeconds: pending.interval,
        verificationUri: action.fallbackUrl,
        verificationUriComplete: action.url,
        userCode: action.code,
        expiresAt: action.expiresAt,
        resume: action.resume,
      });
    };
    const boundedPolling =
      options.timeoutSeconds === undefined
        ? polling
        : polling.pipe(
            Effect.timeoutOrElse({
              duration: Duration.seconds(options.timeoutSeconds),
              orElse: () =>
                Effect.fail(
                  stillPending({ _tag: "Elapsed", seconds: options.timeoutSeconds ?? 0 }),
                ),
            }),
          );

    const token = yield* presenter
      .awaitHuman(
        {
          _tag: "DeviceLogin",
          registryHost,
          verificationUriComplete: pending.verificationUriComplete,
          verificationUri: pending.verificationUri,
          userCode: pending.userCode,
          expiresAtMs: DateTime.toEpochMillis(pending.expiresAt),
          browserOpened: options.sideEffects?.browserOpened ?? false,
          copiedToClipboard: options.sideEffects?.copiedToClipboard ?? false,
        },
        boundedPolling,
      )
      .pipe(
        // Stopping the wait is not a denial: the code is still live and the
        // stored sign-in is left exactly where it was.
        Effect.catchTag("AuthInteractionAbandoned", () =>
          Effect.fail(stillPending({ _tag: "Stopped" })),
        ),
        Effect.catchTag("DeviceLoginCodeExpired", (error) =>
          pendingStore.clear().pipe(
            Effect.flatMap(() =>
              Effect.fail(
                new RegistryAccessFailed({
                  category: "auth_expired",
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
          ),
        ),
        Effect.catchTag("DeviceLoginDenied", (error) =>
          pendingStore.clear().pipe(
            Effect.flatMap(() =>
              Effect.fail(
                new RegistryAccessFailed({
                  category: "auth_denied",
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
          ),
        ),
      );

    yield* pendingStore.clear();
    const handle = yield* presenter.withProgress({ _tag: "SavingCredentials", registryHost }, () =>
      persistLoginCredentials(registryUrl, token),
    );

    yield* emitLoginSuccess(registryUrl, handle);
  });

export const runDeviceLogin = (registryUrl: string, options: RunDeviceLoginOptions = {}) =>
  Effect.gen(function* () {
    const pending = yield* initiateDeviceLogin(registryUrl, {
      ...options,
      emitPendingResult: false,
    });
    const sideEffects = yield* openDeviceHandoff(pending, options);
    yield* resumeDeviceLogin(registryUrl, { sideEffects });
  });
