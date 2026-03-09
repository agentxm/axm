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
import { CredentialStore } from "../../../auth/credential-store.js";
import { ClackLog } from "../../../clack-effect/log/service.js";
import { ClackSpinner } from "../../../clack-effect/spinner/service.js";
import { ClackPrompt } from "../../../clack-effect/prompt/service.js";
import { CliFlags } from "../../../cli-flags/index.js";
import { makeCliError } from "../../../cli-error/index.js";

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const DEFAULT_REGISTRY_URL = "https://registry.agentxm.ai";

// -----------------------------------------------------------------------------
// Handler
// -----------------------------------------------------------------------------

export const handleLogin = Effect.fn("AuthLogin.handle")(function* () {
  const authClient = yield* AuthClient;
  const credStore = yield* CredentialStore;
  const flags = yield* CliFlags;
  const log = yield* ClackLog;
  const spinnerSvc = yield* ClackSpinner;
  const prompt = yield* ClackPrompt;

  const registryUrl = DEFAULT_REGISTRY_URL;

  // Step 1: Reject non-interactive mode
  if (flags.nonInteractive) {
    return yield* makeCliError({
      code: "AUTH_LOGIN_REQUIRED",
      what: "Login requires an interactive terminal",
      howToFix:
        "Set the AXM_TOKEN environment variable or run `axm login` in an interactive terminal.",
    });
  }

  // Step 2: Check existing auth
  const existing = yield* credStore.load(registryUrl);
  if (Option.isSome(existing)) {
    yield* log.info(`Already logged in as ${existing.value.handle}.`);
    if (!flags.yes) {
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

  // Step 4: Display URL and code
  yield* log.step(`Open this URL in your browser: ${deviceFlow.verification_uri}`);
  yield* log.step(`Enter code: ${deviceFlow.user_code}`);

  // Step 5: Poll with spinner
  const token = yield* spinnerSvc.withSpinner(
    "Waiting for approval in browser...",
    () => authClient.pollDeviceToken(registryUrl, deviceFlow.device_code, deviceFlow.interval),
    { successMessage: "Login successful." },
  );

  // Step 6: Fetch identity and persist
  const meResult = yield* authClient.getMe(registryUrl, token.access_token).pipe(Effect.option);

  const handle = Option.match(meResult, {
    onNone: () => "unknown",
    onSome: (me) => me.userHandle,
  });

  yield* credStore.save(registryUrl, handle, {
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expires_at: token.expires_at,
  });

  // Step 7: Display result
  if (Option.isSome(meResult)) {
    yield* log.success(`Logged in as ${meResult.value.userHandle}`);
  } else {
    yield* log.success("Login successful.");
  }
}, Effect.asVoid);
