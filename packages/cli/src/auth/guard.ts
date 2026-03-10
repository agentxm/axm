/**
 * Auth guard combinator for publish-time recovery.
 *
 * Wraps an Effect with a pre-check for authentication. If no token is
 * resolvable, prompts the user to sign in (respecting --yes and
 * --non-interactive flags), runs the device code login flow inline,
 * and retries the inner effect once on login success.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { CliError } from "../cli-error/cli-error.js";
import { makeCliError } from "../cli-error/cli-error.js";
import { ClackLog } from "../clack-effect/log/service.js";
import { ClackPrompt } from "../clack-effect/prompt/service.js";
import { ClackSpinner } from "../clack-effect/spinner/service.js";
import { CliFlags } from "../cli-flags/index.js";
import { CliEnvConfig } from "../config/index.js";
import type { PromptCancelled } from "../prompt-cancelled.js";
import { AuthClient } from "./auth-client.js";
import { CredentialStore } from "./credential-store.js";
import { RegistryUrl } from "./auth-middleware.js";
import { resolveToken } from "./token-resolution.js";

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const AUTH_LOGIN_REQUIRED_NON_INTERACTIVE = makeCliError({
  code: "AUTH_LOGIN_REQUIRED",
  what: "Authentication required",
  howToFix: "Set the AXM_TOKEN environment variable or run `axm login` in an interactive terminal.",
});

const AUTH_LOGIN_REQUIRED_DECLINED = makeCliError({
  code: "AUTH_LOGIN_REQUIRED",
  what: "Authentication required",
  howToFix: "Run `axm login` to sign in.",
});

// -----------------------------------------------------------------------------
// Auth guard combinator
// -----------------------------------------------------------------------------

/**
 * Wraps an Effect with a publish-time auth guard.
 *
 * - If a token is already resolvable, runs the inner effect directly.
 * - If no token and `--non-interactive`: fails with `AUTH_LOGIN_REQUIRED`.
 * - If no token and TTY: prompts to sign in (auto-accepted by `--yes`).
 * - On login success: retries the inner effect once.
 * - On decline: fails with `AUTH_LOGIN_REQUIRED`.
 */
export const withAuthGuard = <A, E, R>(
  effect: Effect.Effect<A, E | CliError, R>,
): Effect.Effect<
  A,
  E | CliError | PromptCancelled,
  R | CredentialStore | AuthClient | CliFlags | CliEnvConfig | RegistryUrl | ClackPrompt | ClackLog | ClackSpinner
> =>
  Effect.gen(function* () {
    const registryUrl = yield* RegistryUrl;
    const token = yield* resolveToken(registryUrl);

    // Token available — proceed directly
    if (Option.isSome(token)) {
      return yield* effect;
    }

    // No token — check flags
    const flags = yield* CliFlags;

    if (flags.nonInteractive) {
      return yield* Effect.fail(AUTH_LOGIN_REQUIRED_NON_INTERACTIVE);
    }

    // Interactive: prompt (auto-accept with --yes)
    if (!flags.yes) {
      const prompt = yield* ClackPrompt;
      const shouldLogin = yield* prompt.confirm({
        message: "You need to sign in to publish. Sign in now?",
      });
      if (!shouldLogin) {
        return yield* Effect.fail(AUTH_LOGIN_REQUIRED_DECLINED);
      }
    }

    // Run inline login flow
    yield* inlineLogin(registryUrl);

    // Retry the inner effect once after login
    return yield* effect;
  });

// -----------------------------------------------------------------------------
// Inline login (reuses AuthClient directly)
// -----------------------------------------------------------------------------

const inlineLogin = (registryUrl: string) =>
  Effect.gen(function* () {
    const authClient = yield* AuthClient;
    const credStore = yield* CredentialStore;
    const log = yield* ClackLog;
    const spinnerSvc = yield* ClackSpinner;

    // Initiate device flow
    const deviceFlow = yield* authClient.initiateDeviceFlow(registryUrl);

    // Display URL and code
    yield* log.step(`Open this URL in your browser: ${deviceFlow.verification_uri}`);
    yield* log.step(`Enter code: ${deviceFlow.user_code}`);

    // Poll with spinner
    const token = yield* spinnerSvc.withSpinner(
      "Waiting for approval in browser...",
      () => authClient.pollDeviceToken(registryUrl, deviceFlow.device_code, deviceFlow.interval),
      { successMessage: "Login successful." },
    );

    // Fetch identity and persist
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

    yield* log.success(`Logged in as ${handle}`);
  });
