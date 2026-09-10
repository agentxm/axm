/**
 * Auth guard combinator for commands that require authentication.
 *
 * Wraps an Effect with a pre-check for authentication. If no token is
 * resolvable, fails immediately with an actionable error message directing
 * the user to `axm login`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { RegistryUrl } from "@agentxm/registry-client";
import { authLoginRequired, RegistryAuthFailed, type AuthError } from "./errors.js";
import { CredentialStore, makePersistedCredentialsUnsupportedError } from "./credential-store.js";
import { resolveRequestToken } from "./token-resolution.js";

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const AUTH_LOGIN_REQUIRED = authLoginRequired();

// -----------------------------------------------------------------------------
// Auth guard combinator
// -----------------------------------------------------------------------------

const isRemoteRegistryUrl = (registryUrl: string) =>
  Effect.try({
    try: () => {
      const protocol = new URL(registryUrl).protocol;
      return protocol === "http:" || protocol === "https:";
    },
    catch: (error) =>
      new RegistryAuthFailed({
        category: "validation",
        detail: `Invalid registry URL: ${registryUrl}`,
        suggestions: [{ description: "Check the registry URL in your settings." }],
        cause: error,
      }),
  });

/**
 * Wraps an Effect with an auth guard.
 *
 * - If the target registry is local, runs the inner effect directly.
 * - If a token is already resolvable, runs the inner effect directly.
 * - If no token: fails with `AUTH_LOGIN_REQUIRED`.
 */
export const withAuthGuard = <A, E, R>(
  effect: Effect.Effect<A, E | AuthError, R>,
  options?: { registryUrl?: string },
) =>
  Effect.gen(function* () {
    const defaultRegistryUrl = yield* RegistryUrl;
    const targetRegistryUrl = options?.registryUrl ?? defaultRegistryUrl;

    // Local registries do not require HTTP auth.
    const isRemote = yield* isRemoteRegistryUrl(targetRegistryUrl);
    if (!isRemote) {
      return yield* effect;
    }

    const token = yield* resolveRequestToken(targetRegistryUrl, defaultRegistryUrl);

    // Token available — proceed directly
    if (Option.isSome(token)) {
      return yield* effect;
    }

    const credStore = yield* CredentialStore;
    if (!credStore.allowsPersistedCredentials) {
      return yield* makePersistedCredentialsUnsupportedError();
    }

    // No token — fail fast
    return yield* AUTH_LOGIN_REQUIRED;
  });
