import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { Command, Flag, Prompt } from "effect/unstable/cli";

import {
  AuthClient,
  CredentialStore,
  makePersistedCredentialsUnsupportedError,
  initiateDeviceLogin,
  resumeDeviceLogin,
  runDeviceLogin,
  runLoopbackLogin,
  selectLoginStrategy,
  type AuthError,
  type LoginStrategyEnvironment,
  type LoopbackCallbackRejected,
  type LoopbackLoginFallback,
  type RunDeviceLoginOptions,
  type DeviceLoginPendingResult,
  type ResumeDeviceLoginOptions,
  type RunLoopbackLoginOptions,
} from "@agentxm/registry-auth";
import { RegistryUrl } from "@agentxm/registry-client";
import { requireInteractive } from "../../prompt/index.js";
import { Screen, headlineDoc, paragraphDoc, successDoc } from "../../screen/index.js";
import { isNonInteractive, jsonFlag } from "../../cli-flags/index.js";
import { setCommandSemanticProperties, withArgvTracking } from "../../cli-runtime/index.js";
import {
  preapprovalCapabilityFlag,
  withCommandCapabilities,
  type CommandCapabilities,
} from "../shared/command-capabilities.js";
import { type SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import { errAuthRequired, makeAppError, type AppError } from "../../app-error/index.js";
import type { PromptCancelled } from "../../prompt/prompt-cancelled.js";
import { envOption } from "../../utils/index.js";
import { coerceAuthFailure } from "../../feature-errors.js";
import { withRuntime } from "../../runtime.js";
import { observeUnit } from "@agentxm/workspace-operations";
import { withLiveOperation } from "../shared/operation-lifecycle.js";

export const LoginNoOpResultSchema = Schema.Struct({
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
  { description: "Sign in again with a different account", cmd: "axm login --yes" },
] satisfies ReadonlyArray<SuggestedAction>;

/**
 * Login writes credentials directly; the one confirmation it can approve in
 * advance is replacing a session that is still valid.
 */
const loginCapabilities = {
  preview: false,
  preapproval: {
    purpose: "Start a new sign-in without prompting when a valid session already exists",
  },
  trust: [],
  inputs: "explicit-or-documented-defaults",
  effect: "credentials",
} satisfies CommandCapabilities;

interface LoginInteractions {
  readonly confirmRelogin?: (message: string) => Effect.Effect<boolean, PromptCancelled | AppError>;
  readonly loginStrategyEnvironment?: LoginStrategyEnvironment;
  readonly runLoopbackLogin?: (
    registryUrl: string,
    options?: RunLoopbackLoginOptions,
  ) => Effect.Effect<void, AppError | AuthError | LoopbackLoginFallback | LoopbackCallbackRejected>;
  readonly runDeviceLogin?: (
    registryUrl: string,
    options?: RunDeviceLoginOptions,
  ) => Effect.Effect<void, AppError | AuthError>;
  readonly initiateDeviceLogin?: (
    registryUrl: string,
    options?: RunDeviceLoginOptions,
  ) => Effect.Effect<DeviceLoginPendingResult, AppError | AuthError>;
  readonly resumeDeviceLogin?: (
    registryUrl: string,
    options?: ResumeDeviceLoginOptions,
  ) => Effect.Effect<void, AppError | AuthError>;
}

const confirmRelogin = (message: string) =>
  Effect.flatMap(Screen, (screen) =>
    screen.prompt(requireInteractive(Prompt.confirm({ message }), { message })),
  );

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

export const handleLogin = Effect.fn("AuthLogin.handle")(
  function* (
    options: {
      readonly yes: boolean;
      readonly deviceCode: boolean;
      readonly restart?: boolean;
      readonly wait?: boolean;
      readonly timeoutSeconds?: number;
      readonly scopes: ReadonlyArray<string>;
    },
    interactions?: LoginInteractions,
  ) {
    const credStore = yield* CredentialStore;
    const screen = yield* Screen;
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
    if (options.wait && options.restart) {
      return yield* makeAppError({
        code: "usage",
        detail: "--restart starts a replacement device sign-in and cannot be combined with --wait.",
      });
    }
    if (options.restart && !options.deviceCode) {
      return yield* makeAppError({
        code: "usage",
        detail: "--restart requires --device-code.",
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
      const meResult = yield* withLiveOperation(
        {
          command: "auth.login",
          name: `Check registry session on ${registryHost}`,
          mode: "preview",
        },
        observeUnit(
          { id: "session", label: `registry session on ${registryHost}` },
          authClient.getMe(existing.value.access_token).pipe(Effect.option),
        ),
      );

      if (Option.isSome(meResult)) {
        const noOpResult: LoginNoOpResult = {
          status: "already-logged-in",
          registryHost,
          handle: meResult.value.userHandle,
        };
        const reportAlreadyLoggedIn = Effect.gen(function* () {
          if (
            yield* screen.document({ result: noOpResult }, LoginNoOpDocumentSchema, {
              suggestions: LoginNoOpSuggestions,
            })
          ) {
            return;
          }
          yield* screen.result(
            successDoc(`Already logged in to ${registryHost} as ${noOpResult.handle}.`, {
              suggestions: LoginNoOpSuggestions,
            }),
          );
        });

        // Preapproval answers the one question a valid session raises, so a
        // new sign-in starts in every mode. Without it, a mode that cannot
        // ask keeps the session; a mode that can asks.
        if (!options.yes && (nonInteractive || jsonMode)) {
          yield* reportAlreadyLoggedIn;
          return;
        }
        if (!jsonMode) {
          yield* screen.note(
            headlineDoc("info", `Already logged in as ${meResult.value.userHandle}.`),
          );
        }
        if (!options.yes) {
          const message = "Log in with a different account?";
          const shouldContinue = yield* interactions?.confirmRelogin?.(message) ??
            confirmRelogin(message);
          if (!shouldContinue) {
            yield* reportAlreadyLoggedIn;
            return;
          }
        }
      } else if (!jsonMode) {
        yield* screen.note(
          headlineDoc(
            "info",
            "Your saved credentials are no longer valid. Starting a new sign-in…",
          ),
        );
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
    const restartOptions = options.restart === undefined ? {} : { restart: options.restart };

    // The sign-in flows report their phases as lifecycle units through the
    // login presenter; one observed operation spans whichever flow runs.
    return yield* withLiveOperation(
      { command: "auth.login", name: `Sign in to ${registryHost}`, mode: "apply" },
      Effect.gen(function* () {
        if (strategy === "device-code") {
          if (!options.deviceCode) {
            yield* screen.note(
              paragraphDoc(
                "This environment appears to be remote or headless; using device-code sign-in.",
              ),
              { persistent: true },
            );
          }
          if (nonInteractive) {
            const result = yield* performInitiateDeviceLogin(registryUrl, {
              openBrowser: false,
              ...restartOptions,
              ...requestedScopeOptions,
            });
            yield* setCommandSemanticProperties({
              "cli.auth.device_flow": result.flow,
            });
          } else {
            yield* performDeviceLogin(registryUrl, {
              openBrowser: false,
              ...restartOptions,
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

        yield* Effect.suspend(() =>
          performLoopbackLogin(registryUrl, {
            ...requestedScopeOptions,
          }),
        ).pipe(
          Effect.catchTag("LoopbackLoginFallback", (error) =>
            error.reason === "bind_failed"
              ? Effect.gen(function* () {
                  yield* screen.note(
                    paragraphDoc(
                      "Could not start a local callback server; using device-code sign-in instead.",
                    ),
                    { persistent: true },
                  );
                  yield* performDeviceLogin(registryUrl, {
                    openBrowser: true,
                    ...restartOptions,
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
      }),
    );
  },
  Effect.mapError(coerceAuthFailure),
  Effect.asVoid,
);

const loginConfig = {
  yes: preapprovalCapabilityFlag(loginCapabilities),
  deviceCode: Flag.boolean("device-code").pipe(
    Flag.withDescription(
      "Use OAuth device-code sign-in; recommended for SSH and headless environments",
    ),
    Flag.withDefault(false),
  ),
  wait: Flag.boolean("wait").pipe(
    Flag.withDescription("Resume and wait for a pending device sign-in"),
    Flag.withDefault(false),
  ),
  restart: Flag.boolean("restart").pipe(
    Flag.withDescription("Replace an existing pending device sign-in intentionally"),
    Flag.withDefault(false),
  ),
  timeout: Flag.integer("timeout").pipe(
    Flag.withDescription("Maximum seconds to wait for device approval; requires --wait"),
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
  ({ yes, deviceCode, wait, restart, timeout, scope }) =>
    handleLogin({
      yes,
      deviceCode,
      wait,
      restart,
      ...Option.match(timeout, {
        onNone: () => ({}),
        onSome: (timeoutSeconds) => ({ timeoutSeconds }),
      }),
      scopes: scope,
    }).pipe(withRuntime("auth login")),
).pipe(
  withArgvTracking(loginConfig),
  withCommandCapabilities(loginCapabilities),
  Command.withDescription("Sign in to a registry"),
  Command.withExamples([
    { command: "axm login", description: "Sign in with a local browser" },
    { command: "axm login --device-code", description: "Sign in from SSH or a headless machine" },
    { command: "axm login --wait", description: "Resume a pending device sign-in" },
    {
      command: "axm login --wait --timeout 300",
      description: "Wait up to 300 seconds for a pending device sign-in",
    },
  ]),
);
