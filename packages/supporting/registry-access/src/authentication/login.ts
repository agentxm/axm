/**
 * Sign-in orchestration: flag coherence, persisted-credential policy, the
 * existing-session decision, strategy selection, and the loopback →
 * device-code fallback chain.
 *
 * The capability decides; the application supplies presentation through
 * `AuthLoginPresenter` and platform integration through
 * `AuthLoginInteraction`. No sign-in decision is taken outside this module.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { AuthClient, type MeResponse } from "./auth-client.js";
import {
  CredentialStore,
  makePersistedCredentialsUnsupportedError,
} from "../credentials/credential-store.js";
import {
  initiateDeviceLogin,
  resumeDeviceLogin,
  runDeviceLogin,
  type RunDeviceLoginOptions,
} from "./device-login.js";
import { isRejectedCredential, RegistryAccessFailed } from "./errors.js";
import type {
  LoopbackCallbackRejected,
  LoopbackLoginFallback,
} from "../adapters/loopback-server.js";
import { AuthLoginPresenter } from "./login-presenter.js";
import { runLoopbackLogin } from "../adapters/loopback-login.js";
import { selectLoginStrategy } from "./login-strategy.js";
import { loginStrategyEnvironment } from "../adapters/environment.js";

/** The invocation's sign-in inputs, parsed from the command line. */
export interface LoginRequest {
  /** Preapproval: start a new sign-in without asking about a valid session. */
  readonly yes: boolean;
  readonly deviceCode: boolean;
  readonly restart: boolean;
  /** Start or resume device sign-in and wait this many seconds for approval. */
  readonly waitForHumanSeconds?: number;
  /** No terminal is available to run a sign-in flow interactively. */
  readonly nonInteractive: boolean;
  /** The invocation reports through a machine document rather than prose. */
  readonly machineOutput: boolean;
}

/** What one `login` invocation settled on. */
export type LoginOutcome =
  /** A valid session was found and kept; nothing was written. */
  | {
      readonly _tag: "SessionRetained";
      readonly registryHost: string;
      readonly handle: string;
    }
  /** A sign-in flow ran; the presenter reported its result. */
  | { readonly _tag: "SignInAttempted" };

const usage = (detail: string) => new RegistryAccessFailed({ category: "usage", detail });

/**
 * The device-login options one sign-in request means. Exported so the option
 * shaping is provable without substituting the flow it is handed to.
 */
export const deviceLoginOptions = (
  request: Pick<LoginRequest, "restart" | "waitForHumanSeconds">,
  openBrowser: boolean,
): RunDeviceLoginOptions => ({
  openBrowser,
  restart: request.restart,
  ...(request.waitForHumanSeconds === undefined
    ? {}
    : { timeoutSeconds: request.waitForHumanSeconds }),
});

/**
 * How a loopback sign-in that could not complete is classified.
 *
 * A failed bind is recoverable — device-code sign-in replaces it — while an
 * expired wait or a rejected callback is terminal and leaves credentials
 * untouched.
 */
export const classifyLoopbackFailure = (
  error: LoopbackLoginFallback | LoopbackCallbackRejected,
): RegistryAccessFailed =>
  error._tag === "LoopbackLoginFallback"
    ? new RegistryAccessFailed({
        category: "auth",
        detail: "Browser sign-in expired after 5 minutes. No credentials were changed.",
        suggestions: [
          { description: "Try browser sign-in again.", cmd: "axm login" },
          {
            description: "Use device-code sign-in on a remote or headless machine.",
            cmd: "axm login --device-code",
          },
        ],
        cause: error,
      })
    : new RegistryAccessFailed({
        category: "auth",
        detail:
          error.reason === "access_denied"
            ? "Sign-in was cancelled. No credentials were changed."
            : "The authorization callback was invalid and sign-in could not be completed. Run `axm login` to try again.",
        suggestions: [{ description: "Try signing in again.", cmd: "axm login" }],
        cause: error,
      });

const rejectIncoherentFlags = (request: LoginRequest) =>
  request.restart && !request.deviceCode
    ? Option.some(usage("--restart requires --device-code."))
    : request.waitForHumanSeconds !== undefined &&
        (!Number.isSafeInteger(request.waitForHumanSeconds) || request.waitForHumanSeconds <= 0)
      ? Option.some(usage("--wait-for-human must be a positive number of seconds."))
      : Option.none();

/**
 * Decide whether a session that is still valid should be replaced.
 *
 * Preapproval answers the one question a valid session raises, so a new
 * sign-in starts in every mode. Without it, a mode that cannot ask keeps the
 * session; a mode that can, asks.
 */
const shouldReplaceValidSession = (request: LoginRequest, handle: string) =>
  Effect.gen(function* () {
    const presenter = yield* AuthLoginPresenter;
    if (request.yes) {
      if (!request.machineOutput) yield* presenter.noteExistingSession(handle);
      return true;
    }
    if (request.nonInteractive || request.machineOutput) return false;
    yield* presenter.noteExistingSession(handle);
    const decision = yield* presenter.confirmSessionReplacement();
    return decision === "replace";
  });

export const login = Effect.fn("Login.run")(function* (request: LoginRequest, registryUrl: string) {
  const credentials = yield* CredentialStore;
  const presenter = yield* AuthLoginPresenter;
  const registryHost = new URL(registryUrl).host;

  const incoherent = rejectIncoherentFlags(request);
  if (Option.isSome(incoherent)) return yield* Effect.fail(incoherent.value);

  if (!credentials.allowsPersistedCredentials) {
    return yield* makePersistedCredentialsUnsupportedError();
  }

  const existing = yield* credentials.load(registryUrl);
  if (Option.isSome(existing)) {
    const authClient = yield* AuthClient;
    // The identity read travels the renewing transport, so a session whose
    // access token has lapsed is renewed rather than mistaken for one the
    // Registry ended. Only the Registry's rejection starts a new sign-in: a
    // Registry that could not be asked says nothing about the session, and the
    // failure is reported instead of replacing a session that may be valid.
    const identity = yield* presenter.withProgress(
      { _tag: "CheckingRegistrySession", registryHost },
      () =>
        authClient.getMe().pipe(
          Effect.asSome,
          Effect.catchIf(isRejectedCredential, () => Effect.succeed(Option.none<MeResponse>())),
        ),
    );
    if (Option.isSome(identity)) {
      if (!(yield* shouldReplaceValidSession(request, identity.value.userHandle))) {
        return {
          _tag: "SessionRetained",
          registryHost,
          handle: identity.value.userHandle,
        } as const satisfies LoginOutcome;
      }
    } else if (!request.machineOutput) {
      yield* presenter.noteRejectedStoredCredentials;
    }
  }

  const strategy =
    request.waitForHumanSeconds === undefined
      ? selectLoginStrategy(
          { deviceCode: request.deviceCode, nonInteractive: request.nonInteractive },
          yield* loginStrategyEnvironment,
        )
      : "device-code";
  const deviceOptions = (openBrowser: boolean) => deviceLoginOptions(request, openBrowser);
  const unattended = request.nonInteractive || request.machineOutput;

  if (strategy === "device-code") {
    if (!request.deviceCode && request.waitForHumanSeconds === undefined) {
      yield* presenter.noteDeviceCodeFallback("remote-or-headless");
    }
    if (request.waitForHumanSeconds !== undefined && unattended) {
      // No person is at this process, so it opens no browser: it starts or
      // reuses the sign-in and waits on it.
      yield* initiateDeviceLogin(registryUrl, {
        restart: request.restart,
        emitPendingResult: false,
      });
      yield* resumeDeviceLogin(registryUrl, { timeoutSeconds: request.waitForHumanSeconds });
    } else if (request.waitForHumanSeconds !== undefined) {
      yield* runDeviceLogin(registryUrl, deviceOptions(!request.deviceCode));
    } else if (request.nonInteractive) {
      yield* initiateDeviceLogin(registryUrl, deviceOptions(false));
    } else {
      yield* runDeviceLogin(registryUrl, deviceOptions(false));
    }
    return { _tag: "SignInAttempted" } as const satisfies LoginOutcome;
  }

  if (request.nonInteractive) {
    return yield* new RegistryAccessFailed({
      category: "auth",
      detail:
        "Loopback browser sign-in requires an interactive terminal. Use device-code sign-in instead.",
      suggestions: [
        {
          description: "Use device-code sign-in on a remote or headless machine.",
          cmd: "axm login --device-code",
        },
      ],
    });
  }

  yield* Effect.suspend(() => runLoopbackLogin(registryUrl)).pipe(
    Effect.catchTag("LoopbackLoginFallback", (error) =>
      error.reason === "bind_failed"
        ? presenter
            .noteDeviceCodeFallback("loopback-bind-failed")
            .pipe(Effect.andThen(runDeviceLogin(registryUrl, deviceOptions(true))))
        : Effect.fail(classifyLoopbackFailure(error)),
    ),
    Effect.catchTag("LoopbackCallbackRejected", (error) =>
      Effect.fail(classifyLoopbackFailure(error)),
    ),
  );
  return { _tag: "SignInAttempted" } as const satisfies LoginOutcome;
});
