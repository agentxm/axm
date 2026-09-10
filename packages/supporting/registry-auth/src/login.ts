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

import { AuthClient } from "./auth-client.js";
import { CredentialStore, makePersistedCredentialsUnsupportedError } from "./credential-store.js";
import {
  initiateDeviceLogin,
  resumeDeviceLogin,
  runDeviceLogin,
  type RunDeviceLoginOptions,
} from "./device-login.js";
import { RegistryAuthFailed } from "./errors.js";
import type { LoopbackCallbackRejected, LoopbackLoginFallback } from "./loopback-server.js";
import { AuthLoginPresenter } from "./login-presenter.js";
import { runLoopbackLogin } from "./loopback-login.js";
import { selectLoginStrategy } from "./login-strategy.js";
import { loginStrategyEnvironment } from "./internal/environment.js";

/** The invocation's sign-in inputs, parsed from the command line. */
export interface LoginRequest {
  /** Preapproval: start a new sign-in without asking about a valid session. */
  readonly yes: boolean;
  readonly deviceCode: boolean;
  readonly restart: boolean;
  /** Resume and wait for a pending device sign-in instead of starting one. */
  readonly wait: boolean;
  readonly timeoutSeconds?: number;
  readonly scopes: ReadonlyArray<string>;
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
  | { readonly _tag: "SignInAttempted" }
  /** A pending device sign-in was resumed. */
  | { readonly _tag: "PendingSignInResumed" };

const usage = (detail: string) => new RegistryAuthFailed({ category: "usage", detail });

/**
 * The device-login options one sign-in request means. Exported so the option
 * shaping is provable without substituting the flow it is handed to.
 */
export const deviceLoginOptions = (
  request: Pick<LoginRequest, "restart" | "scopes">,
  openBrowser: boolean,
): RunDeviceLoginOptions => ({
  openBrowser,
  restart: request.restart,
  ...(request.scopes.length === 0 ? {} : { scopes: [...request.scopes] }),
});

/** The resume options one `--wait` request means. */
export const resumeLoginOptions = (
  request: Pick<LoginRequest, "timeoutSeconds">,
): { readonly timeoutSeconds?: number } =>
  request.timeoutSeconds === undefined ? {} : { timeoutSeconds: request.timeoutSeconds };

/**
 * How a loopback sign-in that could not complete is classified.
 *
 * A failed bind is recoverable — device-code sign-in replaces it — while an
 * expired wait or a rejected callback is terminal and leaves credentials
 * untouched.
 */
export const classifyLoopbackFailure = (
  error: LoopbackLoginFallback | LoopbackCallbackRejected,
): RegistryAuthFailed =>
  error._tag === "LoopbackLoginFallback"
    ? new RegistryAuthFailed({
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
    : new RegistryAuthFailed({
        category: "auth",
        detail:
          error.reason === "access_denied"
            ? "Sign-in was cancelled. No credentials were changed."
            : "The authorization callback was invalid and sign-in could not be completed. Run `axm login` to try again.",
        suggestions: [{ description: "Try signing in again.", cmd: "axm login" }],
        cause: error,
      });

const rejectIncoherentFlags = (request: LoginRequest) =>
  request.wait && request.deviceCode
    ? Option.some(
        usage(
          "--wait resumes an existing device sign-in and cannot be combined with --device-code.",
        ),
      )
    : request.wait && request.restart
      ? Option.some(
          usage(
            "--restart starts a replacement device sign-in and cannot be combined with --wait.",
          ),
        )
      : request.restart && !request.deviceCode
        ? Option.some(usage("--restart requires --device-code."))
        : !request.wait && request.timeoutSeconds !== undefined
          ? Option.some(usage("--timeout requires --wait."))
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
    const decision = yield* presenter.confirmSessionReplacement("Log in with a different account?");
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

  if (request.wait) {
    yield* resumeDeviceLogin(registryUrl, resumeLoginOptions(request));
    return { _tag: "PendingSignInResumed" } as const satisfies LoginOutcome;
  }

  const existing = yield* credentials.load(registryUrl);
  if (Option.isSome(existing)) {
    const authClient = yield* AuthClient;
    const identity = yield* presenter.withProgress(
      { _tag: "CheckingRegistrySession", registryHost },
      () => authClient.getMe(existing.value.access_token).pipe(Effect.option),
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

  const strategy = selectLoginStrategy(
    { deviceCode: request.deviceCode, nonInteractive: request.nonInteractive },
    yield* loginStrategyEnvironment,
  );
  const scopeOptions = request.scopes.length === 0 ? {} : { scopes: [...request.scopes] };
  const deviceOptions = (openBrowser: boolean) => deviceLoginOptions(request, openBrowser);

  if (strategy === "device-code") {
    if (!request.deviceCode) yield* presenter.noteDeviceCodeFallback("remote-or-headless");
    if (request.nonInteractive) {
      yield* initiateDeviceLogin(registryUrl, deviceOptions(false));
    } else {
      yield* runDeviceLogin(registryUrl, deviceOptions(false));
    }
    return { _tag: "SignInAttempted" } as const satisfies LoginOutcome;
  }

  if (request.nonInteractive) {
    return yield* new RegistryAuthFailed({
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

  yield* Effect.suspend(() => runLoopbackLogin(registryUrl, { ...scopeOptions })).pipe(
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
