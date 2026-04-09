import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag, Prompt } from "effect/unstable/cli";

import {
  AuthClient,
  RegistryUrl,
  CredentialStore,
  makePersistedCredentialsUnsupportedError,
  runDeviceLogin,
} from "@axm.sh/core/unstable/auth";
import { fromInteractivePrompt } from "@axm.sh/core/unstable/cli/prompt";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { isNonInteractive, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import { makeAppError, type AppError } from "@axm.sh/core/unstable/app-error";
import type { PromptCancelled } from "@axm.sh/core/unstable/prompt-cancelled";
import { withAuthRuntime } from "../../runtime.js";

interface LoginInteractions {
  readonly confirmRelogin?: (message: string) => Effect.Effect<boolean, PromptCancelled | AppError>;
}

const confirmRelogin = (message: string) =>
  fromInteractivePrompt(Prompt.confirm({ message }), { message });

export const handleLogin = Effect.fn("AuthLogin.handle")(function* (
  options: { yes: boolean },
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
    return yield* makeAppError({
      code: "AUTH_LOGIN_REQUIRED",
      what: "Login requires an interactive terminal",
      howToFix:
        "Set the AXM_TOKEN environment variable or run `axm login` in an interactive terminal.",
    });
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

  yield* runDeviceLogin(registryUrl);
}, Effect.asVoid);

const loginConfig = {
  yes: yesFlag.pipe(
    Flag.withDescription("Skip the browser-open confirmation and launch immediately"),
  ),
} as const;

export const loginCommand = Command.make("login", loginConfig, ({ yes }) =>
  handleLogin({ yes }).pipe(withAuthRuntime("auth login")),
).pipe(
  withArgvTracking(loginConfig),
  Command.withDescription("Sign in to a registry"),
  Command.withExamples([
    { command: "axm auth login", description: "Sign in to the default registry" },
    { command: "axm login", description: "Same command via shortcut" },
    { command: "axm auth login --yes", description: "Skip the browser confirmation" },
  ]),
);
