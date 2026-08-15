import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { Command, Flag, Prompt } from "effect/unstable/cli";

import {
  AuthClient,
  RegistryUrl,
  CredentialStore,
  makePersistedCredentialsUnsupportedError,
  initiateDeviceLogin,
  resumeDeviceLogin,
  runDeviceLogin,
  runLoopbackLogin,
  selectLoginStrategy,
  type LoginStrategyEnvironment,
  type LoopbackCallbackRejected,
  type LoopbackLoginFallback,
  type RunDeviceLoginOptions,
  type DeviceLoginPendingResult,
  type ResumeDeviceLoginOptions,
  type RunLoopbackLoginOptions,
} from "@agentxm/client-core/unstable/auth";
import { requireInteractive } from "@agentxm/client-core/unstable/cli/prompt";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { isNonInteractive, jsonFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import {
  OperationPlanFields,
  makeSingleStepOperationPlan,
  type SuggestedAction,
  withArgvTracking,
} from "@agentxm/client-core/unstable/cli-runtime";
import {
  errAuthRequired,
  makeAppError,
  type AppError,
} from "@agentxm/client-core/unstable/app-error";
import type { PromptCancelled } from "@agentxm/client-core/unstable/prompt-cancelled";
import { envOption } from "@agentxm/client-core/unstable/utils";
import { withRuntime } from "../../runtime.js";

export const LoginNoOpResultSchema = Schema.Struct({
  ...OperationPlanFields,
  status: Schema.Literal("already-logged-in"),
  registryHost: Schema.String,
  handle: Schema.String,
});

const LoginNoOpDocumentFields = {
  result: LoginNoOpResultSchema,
} satisfies Schema.Struct.Fields;
export const LoginNoOpDocumentSchema = Schema.Struct(LoginNoOpDocumentFields);
export type LoginNoOpResult = typeof LoginNoOpResultSchema.Type;
export type LoginNoOpDocument = typeof LoginNoOpDocumentSchema.Type;

const LoginNoOpSuggestions = [
  { description: "Check active account", cmd: "axm whoami" },
  { description: "Log out", cmd: "axm logout" },
] satisfies ReadonlyArray<SuggestedAction>;

interface LoginInteractions {
  readonly confirmRelogin?: (message: string) => Effect.Effect<boolean, PromptCancelled | AppError>;
  readonly loginStrategyEnvironment?: LoginStrategyEnvironment;
  readonly runLoopbackLogin?: (
    registryUrl: string,
    options?: RunLoopbackLoginOptions,
  ) => Effect.Effect<void, AppError | LoopbackLoginFallback | LoopbackCallbackRejected>;
  readonly runDeviceLogin?: (
    registryUrl: string,
    options?: RunDeviceLoginOptions,
  ) => Effect.Effect<void, AppError>;
  readonly initiateDeviceLogin?: (
    registryUrl: string,
    options?: RunDeviceLoginOptions,
  ) => Effect.Effect<DeviceLoginPendingResult, AppError>;
  readonly resumeDeviceLogin?: (
    registryUrl: string,
    options?: ResumeDeviceLoginOptions,
  ) => Effect.Effect<void, AppError>;
}

const confirmRelogin = (message: string) =>
  requireInteractive(Prompt.confirm({ message }), { message });

const loginStrategyEnvironment = Effect.gen(function* () {
  const env = yield* Effect.all({
    SSH_CONNECTION: envOption("SSH_CONNECTION"),
    SSH_CLIENT: envOption("SSH_CLIENT"),
    SSH_TTY: envOption("SSH_TTY"),
    DISPLAY: envOption("DISPLAY"),
    WAYLAND_DISPLAY: envOption("WAYLAND_DISPLAY"),
    CI: envOption("CI"),
    CODESPACES: envOption("CODESPACES"),
  });

  return {
    ...(Option.isSome(env.SSH_CONNECTION) ? { SSH_CONNECTION: env.SSH_CONNECTION.value } : {}),
    ...(Option.isSome(env.SSH_CLIENT) ? { SSH_CLIENT: env.SSH_CLIENT.value } : {}),
    ...(Option.isSome(env.SSH_TTY) ? { SSH_TTY: env.SSH_TTY.value } : {}),
    ...(Option.isSome(env.DISPLAY) ? { DISPLAY: env.DISPLAY.value } : {}),
    ...(Option.isSome(env.WAYLAND_DISPLAY) ? { WAYLAND_DISPLAY: env.WAYLAND_DISPLAY.value } : {}),
    ...(Option.isSome(env.CI) ? { CI: env.CI.value } : {}),
    ...(Option.isSome(env.CODESPACES) ? { CODESPACES: env.CODESPACES.value } : {}),
  };
});

export const handleLogin = Effect.fn("AuthLogin.handle")(function* (
  options: {
    readonly yes: boolean;
    readonly deviceCode: boolean;
    readonly wait?: boolean;
    readonly timeoutSeconds?: number;
    readonly scopes: ReadonlyArray<string>;
  },
  interactions?: LoginInteractions,
) {
  const credStore = yield* CredentialStore;
  const renderer = yield* CliRenderer;
  const registryUrl = yield* RegistryUrl;
  const registryHost = new URL(registryUrl).host;
  const json = yield* jsonFlag;
  const jsonMode = Option.getOrElse(json, () => false);

  const nonInteractive = yield* isNonInteractive;
  if (options.wait && options.deviceCode) {
    return yield* makeAppError({
      code: "usage",
      detail:
        "--wait resumes an existing device sign-in and cannot be combined with --device-code.",
    });
  }
  if (!options.wait && options.timeoutSeconds !== undefined) {
    return yield* makeAppError({
      code: "usage",
      detail: "--timeout requires --wait.",
    });
  }

  if (!credStore.allowsPersistedCredentials) {
    return yield* makePersistedCredentialsUnsupportedError();
  }

  if (options.wait) {
    const performResumeDeviceLogin = interactions?.resumeDeviceLogin ?? resumeDeviceLogin;
    yield* performResumeDeviceLogin(registryUrl, {
      ...(options.timeoutSeconds === undefined ? {} : { timeoutSeconds: options.timeoutSeconds }),
    });
    return;
  }

  // Step 2: Check existing auth — validate token against the server
  const existing = yield* credStore.load(registryUrl);
  if (Option.isSome(existing)) {
    const authClient = yield* AuthClient;
    const meResult = yield* renderer.withSpinner(
      `Checking registry session on ${registryHost}`,
      () => authClient.getMe(existing.value.access_token).pipe(Effect.option),
      { successMessage: `Checked registry session on ${registryHost}` },
    );

    if (Option.isSome(meResult)) {
      const noOpMessage = `Already logged in to ${registryHost} as ${meResult.value.userHandle}`;
      const noOpResult: LoginNoOpResult = {
        ...makeSingleStepOperationPlan({
          planName: "Log in to AXM registry",
          planDescription: "Persist registry credentials for this machine",
          message: noOpMessage,
          stepLabel: "Registry credentials",
          stepStatus: "unchanged",
          stepMessage: noOpMessage,
          artifact: {
            path: registryHost,
            scope: "user",
            change: "unchanged",
          },
        }),
        status: "already-logged-in",
        registryHost,
        handle: meResult.value.userHandle,
      };
      if (!options.yes && jsonMode) {
        if (
          yield* renderer.result({ result: noOpResult }, LoginNoOpDocumentSchema, {
            suggestions: LoginNoOpSuggestions,
          })
        ) {
          return;
        }
      }

      if (nonInteractive) {
        if (!jsonMode) {
          yield* renderer.success(`Already logged in to ${registryHost} as ${noOpResult.handle}.`, {
            suggestions: LoginNoOpSuggestions,
          });
        }
        return;
      }

      if (!jsonMode) {
        yield* renderer.info(`Already logged in as ${meResult.value.userHandle}.`);
      }
      if (!options.yes) {
        const message = "Log in with a different account?";
        const shouldContinue = yield* interactions?.confirmRelogin?.(message) ??
          confirmRelogin(message);
        if (!shouldContinue) {
          if (
            yield* renderer.result({ result: noOpResult }, LoginNoOpDocumentSchema, {
              suggestions: LoginNoOpSuggestions,
            })
          ) {
            return;
          }
          yield* renderer.success(`Already logged in to ${registryHost} as ${noOpResult.handle}.`, {
            suggestions: LoginNoOpSuggestions,
          });
          return;
        }
      }
    } else if (!jsonMode) {
      yield* renderer.info("Your saved credentials are no longer valid. Starting a new sign-in…");
    }
  }

  const strategyEnvironment =
    interactions?.loginStrategyEnvironment === undefined
      ? yield* loginStrategyEnvironment
      : interactions.loginStrategyEnvironment;
  const strategy = selectLoginStrategy({ ...options, nonInteractive }, strategyEnvironment);
  const performDeviceLogin = interactions?.runDeviceLogin ?? runDeviceLogin;
  const performInitiateDeviceLogin = interactions?.initiateDeviceLogin ?? initiateDeviceLogin;
  const performLoopbackLogin = interactions?.runLoopbackLogin ?? runLoopbackLogin;
  const requestedScopeOptions = options.scopes.length === 0 ? {} : { scopes: options.scopes };

  if (strategy === "device-code") {
    if (!options.deviceCode) {
      yield* renderer.instruction(
        "This environment appears to be remote or headless; using device-code sign-in.",
      );
    }
    if (nonInteractive) {
      yield* performInitiateDeviceLogin(registryUrl, {
        openBrowser: false,
        ...requestedScopeOptions,
      });
    } else {
      yield* performDeviceLogin(registryUrl, {
        openBrowser: false,
        ...requestedScopeOptions,
      });
    }
    return;
  }

  if (nonInteractive) {
    return yield* errAuthRequired(
      "Loopback browser sign-in requires an interactive terminal. Use device-code sign-in instead.",
    );
  }

  yield* performLoopbackLogin(registryUrl, {
    ...requestedScopeOptions,
  }).pipe(
    Effect.catchTag("LoopbackLoginFallback", (error) =>
      error.reason === "bind_failed"
        ? Effect.gen(function* () {
            yield* renderer.instruction(
              "Could not start a local callback server; using device-code sign-in instead.",
            );
            yield* performDeviceLogin(registryUrl, {
              openBrowser: false,
              ...requestedScopeOptions,
            });
          })
        : Effect.fail(
            makeAppError({
              code: "auth",
              detail: "Browser sign-in expired after 5 minutes. No credentials were changed.",
              suggestions: [
                { description: "Try browser sign-in again.", cmd: "axm login" },
                {
                  description: "Use device-code sign-in on a remote or headless machine.",
                  cmd: "axm login --device-code",
                },
              ],
              cause: error,
            }),
          ),
    ),
    Effect.catchTag("LoopbackCallbackRejected", (error) =>
      Effect.fail(
        error.reason === "access_denied"
          ? makeAppError({
              code: "auth",
              detail: "Sign-in was cancelled. No credentials were changed.",
              suggestions: [{ description: "Try signing in again.", cmd: "axm login" }],
              cause: error,
            })
          : makeAppError({
              code: "auth",
              detail:
                "The authorization callback was invalid and sign-in could not be completed. Run `axm login` to try again.",
              suggestions: [{ description: "Try signing in again.", cmd: "axm login" }],
              cause: error,
            }),
      ),
    ),
  );
}, Effect.asVoid);

const loginConfig = {
  yes: yesFlag.pipe(
    Flag.withDescription("Log in again without prompting when already authenticated"),
  ),
  deviceCode: Flag.boolean("device-code").pipe(
    Flag.withDescription(
      "Use OAuth device-code sign-in; recommended for SSH and headless environments",
    ),
  ),
  wait: Flag.boolean("wait").pipe(
    Flag.withDescription("Resume and wait for a pending device sign-in"),
  ),
  timeout: Flag.integer("timeout").pipe(
    Flag.withDescription("Maximum seconds to wait for device approval"),
    Flag.optional,
  ),
  scope: Flag.string("scope").pipe(
    Flag.withDescription("Registry scope to request; repeatable"),
    Flag.atLeast(0),
  ),
} as const;

export const loginCommand = Command.make(
  "login",
  loginConfig,
  ({ yes, deviceCode, wait, timeout, scope }) =>
    handleLogin({
      yes,
      deviceCode,
      wait,
      ...Option.match(timeout, {
        onNone: () => ({}),
        onSome: (timeoutSeconds) => ({ timeoutSeconds }),
      }),
      scopes: scope,
    }).pipe(withRuntime("auth login")),
).pipe(
  withArgvTracking(loginConfig),
  Command.withDescription("Sign in to a registry"),
  Command.withExamples([
    { command: "axm login", description: "Sign in with a local browser" },
    { command: "axm login --device-code", description: "Sign in from SSH or a headless machine" },
    { command: "axm login --wait", description: "Resume a pending device sign-in" },
  ]),
);
