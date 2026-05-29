import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag, Prompt } from "effect/unstable/cli";

import {
  AuthClient,
  RegistryUrl,
  CredentialStore,
  makePersistedCredentialsUnsupportedError,
  runDeviceLogin,
  runLoopbackLogin,
  selectLoginStrategy,
  type LoopbackCallbackRejected,
  type LoopbackLoginFallback,
  type RunDeviceLoginOptions,
  type RunLoopbackLoginOptions,
} from "@agentxm/client-core/unstable/auth";
import { requireInteractive } from "@agentxm/client-core/unstable/cli/prompt";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { isNonInteractive, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { errAuthRequired, type AppError } from "@agentxm/client-core/unstable/app-error";
import type { PromptCancelled } from "@agentxm/client-core/unstable/prompt-cancelled";
import { envOption } from "@agentxm/client-core/unstable/utils";
import { withAuthRuntime } from "../../runtime.js";

interface LoginInteractions {
  readonly confirmRelogin?: (message: string) => Effect.Effect<boolean, PromptCancelled | AppError>;
  readonly runLoopbackLogin?: (
    registryUrl: string,
    options?: RunLoopbackLoginOptions,
  ) => Effect.Effect<void, AppError | LoopbackLoginFallback | LoopbackCallbackRejected>;
  readonly runDeviceLogin?: (
    registryUrl: string,
    options?: RunDeviceLoginOptions,
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
    readonly noBrowser: boolean;
    readonly scopes: ReadonlyArray<string>;
  },
  interactions?: LoginInteractions,
) {
  const credStore = yield* CredentialStore;
  const renderer = yield* CliRenderer;
  const registryUrl = yield* RegistryUrl;

  if (!credStore.allowsPersistedCredentials) {
    return yield* makePersistedCredentialsUnsupportedError();
  }

  // Step 1: Reject non-interactive mode
  const nonInteractive = yield* isNonInteractive;
  if (nonInteractive) {
    return yield* errAuthRequired("Login requires an interactive terminal");
  }

  // Step 2: Check existing auth — validate token against the server
  const existing = yield* credStore.load(registryUrl);
  if (Option.isSome(existing)) {
    const authClient = yield* AuthClient;
    const meResult = yield* authClient.getMe(existing.value.access_token).pipe(Effect.option);

    if (Option.isSome(meResult)) {
      yield* renderer.info(`Already logged in as ${meResult.value.userHandle}.`);
      if (!options.yes) {
        const message = "Log in with a different account?";
        const shouldContinue = yield* interactions?.confirmRelogin?.(message) ??
          confirmRelogin(message);
        if (!shouldContinue) {
          return;
        }
      }
    }
  }

  const strategy = selectLoginStrategy(options, yield* loginStrategyEnvironment);
  const performDeviceLogin = interactions?.runDeviceLogin ?? runDeviceLogin;
  const performLoopbackLogin = interactions?.runLoopbackLogin ?? runLoopbackLogin;
  const requestedScopeOptions = options.scopes.length === 0 ? {} : { scopes: options.scopes };

  if (strategy === "device-code") {
    if (!options.deviceCode && !options.noBrowser) {
      yield* renderer.info("No browser available in this environment; using device code fallback.");
    }
    yield* performDeviceLogin(registryUrl, {
      openBrowser: options.deviceCode && !options.noBrowser,
      ...requestedScopeOptions,
    });
    return;
  }

  yield* performLoopbackLogin(registryUrl, {
    ...requestedScopeOptions,
  }).pipe(
    Effect.catchTag("LoopbackLoginFallback", (error) =>
      Effect.gen(function* () {
        yield* renderer.info(`${error.message} Using device code fallback.`);
        yield* performDeviceLogin(registryUrl, {
          openBrowser: false,
          ...requestedScopeOptions,
        });
      }),
    ),
    Effect.catchTag("LoopbackCallbackRejected", (error) =>
      Effect.fail(errAuthRequired(error.message)),
    ),
  );
}, Effect.asVoid);

const loginConfig = {
  yes: yesFlag.pipe(
    Flag.withDescription("Skip the browser-open confirmation and launch immediately"),
  ),
  deviceCode: Flag.boolean("device-code").pipe(
    Flag.withDescription("Use the device-code fallback instead of loopback browser login"),
  ),
  noBrowser: Flag.boolean("no-browser").pipe(
    Flag.withDescription("Do not open a browser; use device-code fallback"),
  ),
  scope: Flag.string("scope").pipe(
    Flag.withDescription("Registry scope to request; repeatable"),
    Flag.atLeast(0),
  ),
} as const;

export const loginCommand = Command.make(
  "login",
  loginConfig,
  ({ yes, deviceCode, noBrowser, scope }) =>
    handleLogin({ yes, deviceCode, noBrowser, scopes: scope }).pipe(withAuthRuntime("auth login")),
).pipe(
  withArgvTracking(loginConfig),
  Command.withDescription("Sign in to a registry"),
  Command.withExamples([
    { command: "axm auth login", description: "Sign in to the default registry" },
    { command: "axm login", description: "Same command via shortcut" },
    { command: "axm auth login --yes", description: "Skip the browser confirmation" },
    {
      command: "axm auth login --scope extensions:publish:version",
      description: "Request a specific registry scope",
    },
    { command: "axm auth login --device-code", description: "Sign in with device code fallback" },
  ]),
);
