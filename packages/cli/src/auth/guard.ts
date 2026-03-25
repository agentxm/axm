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

import { type AppError, makeAppError } from "@axm.sh/core/unstable/app-error";
import { Output } from "@axm.sh/core/unstable/output";
import { Input } from "@axm.sh/core/unstable/input";
import { Activity } from "@axm.sh/core/unstable/activity";
import { isNonInteractive } from "@axm.sh/core/unstable/cli-flags";
import { AuthClient } from "./auth-client.js";
import { CredentialStore } from "./credential-store.js";
import { RegistryUrl } from "./auth-middleware.js";
import { resolveToken } from "./token-resolution.js";

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const AUTH_LOGIN_REQUIRED_NON_INTERACTIVE = makeAppError({
  code: "AUTH_LOGIN_REQUIRED",
  what: "Authentication required",
  howToFix: "Set the AXM_TOKEN environment variable or run `axm login` in an interactive terminal.",
});

const AUTH_LOGIN_REQUIRED_DECLINED = makeAppError({
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
  effect: Effect.Effect<A, E | AppError, R>,
  options: { yes: boolean },
) =>
  Effect.gen(function* () {
    const registryUrl = yield* RegistryUrl;
    const token = yield* resolveToken(registryUrl);

    // Token available — proceed directly
    if (Option.isSome(token)) {
      return yield* effect;
    }

    // No token — check flags
    const nonInteractive = yield* isNonInteractive;

    if (nonInteractive) {
      return yield* Effect.fail(AUTH_LOGIN_REQUIRED_NON_INTERACTIVE);
    }

    // Interactive: prompt (auto-accept with --yes)
    if (!options.yes) {
      const input = yield* Input;
      const shouldLogin = yield* input.confirm({
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
    const output = yield* Output;
    const activity = yield* Activity;

    // Initiate device flow
    const deviceFlow = yield* authClient.initiateDeviceFlow(registryUrl);
    const verificationUrl = deviceFlow.verification_uri_complete ?? deviceFlow.verification_uri;

    // Display URL and code
    yield* output.step(`Open this URL in your browser: ${verificationUrl}`);
    yield* output.step(`Enter code: ${deviceFlow.user_code}`);

    // Poll with spinner
    const token = yield* activity.withSpinner(
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

    yield* output.success(`Logged in as ${handle}`);
  });
