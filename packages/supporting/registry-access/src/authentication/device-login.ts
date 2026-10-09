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
  DeviceLoginCodeExpired,
  RegistryAccessFailed,
  type DeviceWaitEnded,
} from "./errors.js";

import { AuthClient } from "./auth-client.js";
import {
  CredentialStore,
  makePersistedCredentialsUnsupportedError,
} from "../credentials/credential-store.js";
import { emitLoginSuccess, type LoginIdentity } from "./login-output.js";
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

/** What an expired code says, whether the wait or a later resume found it expired. */
const CODE_EXPIRED = "That code expired. Run axm login to get a new one.";

/**
 * The whole minutes a pending code is still good for, as a stopped wait says
 * it. A code with less than a minute left still counts as one.
 */
const wholeMinutesLeft = (remainingSeconds: number): number =>
  Math.max(1, Math.floor(remainingSeconds / 60));

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

    return Option.map(meResult, (me): LoginIdentity => ({
      handle: me.userHandle,
      email: me.email,
    }));
  });

export interface RunDeviceLoginOptions {
  readonly emitPendingResult?: boolean;
  readonly openBrowser?: boolean;
  readonly restart?: boolean;
  readonly timeoutSeconds?: number;
}

export interface ResumeDeviceLoginOptions {
  readonly timeoutSeconds?: number;
  /**
   * What the invocation that started this sign-in already did for the person,
   * so the wait says whether a browser is open. A resume of an earlier
   * invocation opened none.
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
 * The side effect that makes a device handoff easy to complete: the
 * verification page in a browser where one may open. What it achieved travels
 * with the handoff so the terminal can say so. Nothing reaches the clipboard
 * unless the person asks for it during the wait.
 */
export interface DeviceHandoffSideEffects {
  readonly browserOpened: boolean;
}

const openDeviceHandoff = (
  handoff: { readonly verificationUriComplete: string },
  options: RunDeviceLoginOptions,
): Effect.Effect<DeviceHandoffSideEffects, never, DeviceLoginInteraction> =>
  Effect.gen(function* () {
    const interaction = yield* DeviceLoginInteraction;
    const browserOpened =
      (options.openBrowser ?? true)
        ? yield* interaction.openBrowser(handoff.verificationUriComplete)
        : false;
    return { browserOpened };
  });

const makePendingResult = (
  pending: PendingDeviceLogin,
  flow: DeviceLoginPendingResult["flow"] = "started",
): DeviceLoginPendingResult => {
  const registryHost = new URL(pending.registryUrl).host;
  const expiresAt = DateTime.formatIso(pending.expiresAt);
  const resume = "axm login --device-code --wait-for-human 300 --json";
  return {
    status: "pending-human",
    blockedOn: "human",
    retryable: true,
    flow,
    registryHost,
    verificationUri: pending.verificationUri,
    verificationUriComplete: pending.verificationUriComplete,
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
    // Machine mode consumes the pending document; opening a browser and
    // human presentation must not run afterwards.
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

    if (!credStore.allowsPersistedCredentials) {
      return yield* makePersistedCredentialsUnsupportedError();
    }

    const existing = yield* pendingStore.load();
    if (Option.isSome(existing)) {
      const expired = yield* DateTime.isPast(existing.value.expiresAt);
      if (expired || options.restart === true) {
        yield* pendingStore.clear();
      } else if (existing.value.registryUrl === registryUrl) {
        // A pending sign-in asks for exactly what every sign-in asks for, so
        // the registry it belongs to is the only thing that can make it the
        // wrong one to resume.
        // A caller that is about to wait takes the pending sign-in as it
        // stands; the wait shows it, so nothing is re-presented here.
        return options.emitPendingResult === false
          ? makePendingResult(existing.value, "re-emitted")
          : yield* emitPendingDeviceLogin(existing.value, options, "re-emitted");
      } else {
        return yield* new RegistryAccessFailed({
          category: "conflict",
          detail: `A sign-in for ${new URL(existing.value.registryUrl).host} is already pending.`,
          suggestions: [
            {
              description: "Finish the pending sign-in before starting another.",
              cmd: `AXM_REGISTRY_URL=${existing.value.registryUrl} axm login --device-code --wait-for-human 300 --json`,
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
      () => authClient.initiateDeviceFlow(),
    );

    const pending: PendingDeviceLogin = {
      version: 3,
      registryUrl,
      deviceCode: deviceFlow.device_code,
      userCode: deviceFlow.user_code,
      verificationUri: deviceFlow.verification_uri,
      verificationUriComplete: deviceFlow.verification_uri_complete,
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
    detail: "No pending sign-in was found.",
    suggestions: [
      {
        description: "Start a sign-in first.",
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
            cmd: `AXM_REGISTRY_URL=${pending.registryUrl} axm login --device-code --wait-for-human 300 --json`,
          },
        ],
      });
    }

    if (yield* DateTime.isPast(pending.expiresAt)) {
      yield* pendingStore.clear();
      return yield* new RegistryAccessFailed({
        category: "auth_expired",
        detail: CODE_EXPIRED,
        suggestions: [
          {
            description: "Get a new sign-in code.",
            cmd: "axm login --device-code --json",
          },
        ],
      });
    }

    const polling = authClient.pollDeviceToken(pending.deviceCode, pending.interval);
    // The sign-in itself is untouched by how the terminal stopped waiting, so
    // both endings resolve to the same pending outcome and the same resume.
    const stillPending = (waitEnded: DeviceWaitEnded) =>
      Effect.gen(function* () {
        const action = makePendingResult(pending).action;
        const secondsLeft = Duration.toSeconds(
          DateTime.distance(yield* DateTime.now, pending.expiresAt),
        );
        return yield* new DeviceAuthorizationPending({
          waitEnded,
          minutesLeft: wholeMinutesLeft(secondsLeft),
          registryUrl: pending.registryUrl,
          intervalSeconds: pending.interval,
          verificationUri: action.fallbackUrl,
          verificationUriComplete: action.url,
          userCode: action.code,
          expiresAt: action.expiresAt,
          resume: action.resume,
        });
      });
    // The wait ends at whichever comes first: the requested bound or the
    // code's own expiry. Reaching the expiry is terminal, not a pending wait.
    const remainingSeconds = Math.max(
      0,
      Math.ceil(Duration.toSeconds(DateTime.distance(yield* DateTime.now, pending.expiresAt))),
    );
    const waitSeconds = options.timeoutSeconds;
    const boundedPolling =
      waitSeconds === undefined
        ? polling
        : polling.pipe(
            Effect.timeoutOrElse({
              duration: Duration.seconds(Math.min(waitSeconds, remainingSeconds)),
              orElse: (): Effect.Effect<
                never,
                DeviceAuthorizationPending | DeviceLoginCodeExpired
              > =>
                waitSeconds < remainingSeconds
                  ? stillPending({ _tag: "Elapsed", seconds: waitSeconds })
                  : Effect.fail(new DeviceLoginCodeExpired()),
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
        },
        boundedPolling,
      )
      .pipe(
        // Stopping the wait is not a denial: the code is still live and the
        // stored sign-in is left exactly where it was.
        Effect.catchTag("AuthInteractionAbandoned", () => stillPending({ _tag: "Stopped" })),
        Effect.catchTag("DeviceLoginCodeExpired", (error) =>
          pendingStore.clear().pipe(
            Effect.flatMap(() =>
              Effect.fail(
                new RegistryAccessFailed({
                  category: "auth_expired",
                  detail: CODE_EXPIRED,
                  suggestions: [
                    {
                      description: "Get a new sign-in code.",
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
                  detail: "Sign-in canceled in the browser. Nothing changed.",
                  suggestions: [
                    {
                      description: "Start a new sign-in when ready.",
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
    const identity = yield* presenter.withProgress(
      { _tag: "SavingCredentials", registryHost },
      () => persistLoginCredentials(registryUrl, token),
    );

    yield* emitLoginSuccess(registryUrl, identity);
  });

export const runDeviceLogin = (registryUrl: string, options: RunDeviceLoginOptions = {}) =>
  Effect.gen(function* () {
    const pending = yield* initiateDeviceLogin(registryUrl, {
      ...options,
      emitPendingResult: false,
    });
    const sideEffects = yield* openDeviceHandoff(pending, options);
    yield* resumeDeviceLogin(registryUrl, {
      sideEffects,
      ...(options.timeoutSeconds === undefined ? {} : { timeoutSeconds: options.timeoutSeconds }),
    });
  });
