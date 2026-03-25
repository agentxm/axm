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
 * 7. Fetch identity and display "Logged in as <handle>"
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { AuthClient } from "../../../auth/auth-client.js";
import { RegistryUrl } from "../../../auth/auth-middleware.js";
import { CredentialStore } from "../../../auth/credential-store.js";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { CliPrompt } from "@axm.sh/core/unstable/cli-prompt";
import { isNonInteractive } from "@axm.sh/core/unstable/cli-flags";
import { makeAppError } from "@axm.sh/core/unstable/app-error";

// -----------------------------------------------------------------------------
// Handler
// -----------------------------------------------------------------------------

export const handleLogin = Effect.fn("AuthLogin.handle")(function* (options: { yes: boolean }) {
  const authClient = yield* AuthClient;
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

  // Step 2: Check existing auth
  const existing = yield* credStore.load(registryUrl);
  if (Option.isSome(existing)) {
    yield* renderer.info(`Already logged in as ${existing.value.handle}.`);
    if (!options.yes) {
      const shouldContinue = yield* prompt.confirm({
        message: "Log in with a different account?",
      });
      if (!shouldContinue) {
        return;
      }
    }
  }

  // Step 3: Initiate device flow
  const deviceFlow = yield* authClient.initiateDeviceFlow(registryUrl);
  const verificationUrl = deviceFlow.verification_uri_complete ?? deviceFlow.verification_uri;

  // Step 4: Display URL and code
  yield* renderer.step(`Open this URL in your browser: ${verificationUrl}`);
  yield* renderer.step(`Enter code: ${deviceFlow.user_code}`);

  // Step 5: Poll with spinner
  const token = yield* renderer.withSpinner(
    "Waiting for approval in browser...",
    () => authClient.pollDeviceToken(registryUrl, deviceFlow.device_code, deviceFlow.interval),
    { successMessage: "Login successful." },
  );

  // Step 6: Fetch identity before persisting credentials so login fails closed
  const me = yield* authClient.getMe(registryUrl, token.access_token);

  yield* credStore.save(registryUrl, me.userHandle, {
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expires_at: token.expires_at,
  });

  // Step 7: Display result
  yield* renderer.success(`Logged in as ${me.userHandle}`);
}, Effect.asVoid);
