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
import { CliPrompt } from "@axm.sh/core/unstable/cli-prompt";
import { isNonInteractive } from "@axm.sh/core/unstable/cli-flags";
import { RegistryUrl } from "./auth-middleware.js";
import { runDeviceLogin } from "./device-login.js";
import { resolveRequestToken } from "./token-resolution.js";

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

const isRemoteRegistryUrl = (registryUrl: string): boolean => {
  const protocol = new URL(registryUrl).protocol;
  return protocol === "http:" || protocol === "https:";
};

/**
 * Wraps an Effect with a publish-time auth guard.
 *
 * - If the target registry is local, runs the inner effect directly.
 * - If a token is already resolvable, runs the inner effect directly.
 * - If no token and `--non-interactive`: fails with `AUTH_LOGIN_REQUIRED`.
 * - If no token and TTY: prompts to sign in (auto-accepted by `--yes`).
 * - On login success: retries the inner effect once.
 * - On decline: fails with `AUTH_LOGIN_REQUIRED`.
 */
export const withAuthGuard = <A, E, R>(
  effect: Effect.Effect<A, E | AppError, R>,
  options: { yes: boolean; registryUrl?: string },
) =>
  Effect.gen(function* () {
    const defaultRegistryUrl = yield* RegistryUrl;
    const targetRegistryUrl = options.registryUrl ?? defaultRegistryUrl;

    // Local registries do not require HTTP auth.
    if (!isRemoteRegistryUrl(targetRegistryUrl)) {
      return yield* effect;
    }

    const token = yield* resolveRequestToken(targetRegistryUrl, defaultRegistryUrl);

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
      const prompt = yield* CliPrompt;
      const shouldLogin = yield* prompt.confirm({
        message: "You need to sign in to publish. Sign in now?",
      });
      if (!shouldLogin) {
        return yield* Effect.fail(AUTH_LOGIN_REQUIRED_DECLINED);
      }
    }

    // Run inline login flow
    yield* runDeviceLogin(targetRegistryUrl);

    // Retry the inner effect once after login
    return yield* effect;
  });
