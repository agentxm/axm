/**
 * Login command handler -- Effect-based device code flow for `axm auth login`.
 *
 * Flow:
 * 1. Check existing auth → offer re-login
 * 2. Reject in non-interactive mode
 * 3. Initiate device flow via AuthClient
 * 4. Display URL and code for manual browser entry
 * 5. Poll with spinner
 * 6. Persist credentials
 * 7. Fetch identity and display "Logged in to <registry> as <handle>"
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag } from "effect/unstable/cli";

import {
  AuthClient,
  RegistryUrl,
  CredentialStore,
  runDeviceLogin,
} from "@axm.sh/core/unstable/auth";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { CliPrompt } from "@axm.sh/core/unstable/cli-prompt";
import { isNonInteractive, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import { makeAppError } from "@axm.sh/core/unstable/app-error";

import { withRuntime } from "../../runtime.js";

// -----------------------------------------------------------------------------
// Handler
// -----------------------------------------------------------------------------

export const handleLogin = Effect.fn("AuthLogin.handle")(function* (options: { yes: boolean }) {
  const credStore = yield* CredentialStore;
  const renderer = yield* CliRenderer;
  const prompt = yield* CliPrompt;
  const registryUrl = yield* RegistryUrl;

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
        const shouldContinue = yield* prompt.confirm({
          message: "Log in with a different account?",
        });
        if (!shouldContinue) {
          return;
        }
      }
    }
  }

  yield* runDeviceLogin(registryUrl);
}, Effect.asVoid);

// -----------------------------------------------------------------------------
// Command
// -----------------------------------------------------------------------------

const loginConfig = {
  yes: yesFlag.pipe(
    Flag.withDescription("Skip the browser-open confirmation and launch immediately"),
  ),
} as const;

export const loginCommand = Command.make("login", loginConfig, ({ yes }) =>
  withRuntime(handleLogin({ yes }), { command: "auth login" }),
).pipe(
  withArgvTracking(loginConfig),
  Command.withDescription("Sign in to a registry"),
  Command.withExamples([
    { command: "axm auth login", description: "Sign in to the default registry" },
    { command: "axm login", description: "Same command via shortcut" },
    { command: "axm auth login --yes", description: "Skip the browser confirmation" },
    { command: "", description: "See also: auth whoami, auth logout" },
  ]),
);
