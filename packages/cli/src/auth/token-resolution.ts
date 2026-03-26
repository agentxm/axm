/**
 * Token resolution with precedence chain.
 *
 * Resolves authentication tokens from multiple sources in priority order:
 * 1. AXM_TOKEN environment variable
 * 2. --token flag (per-command, passed as parameter)
 * 3. Credential store lookup by registry URL
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { envOption } from "@axm.sh/core/unstable/utils";

import type { AppError } from "@axm.sh/core/unstable/app-error";
import { type TokenResponse, AuthClient } from "./auth-client.js";
import { CredentialStore } from "./credential-store.js";
import {
  CredentialStoreTokenSource,
  EnvVarTokenSource,
  FlagTokenSource,
  type StoredCredentials,
  type TokenSource,
} from "./schema.js";

// -----------------------------------------------------------------------------
// AXM_TOKEN stderr message (once per CLI invocation)
// -----------------------------------------------------------------------------

declare global {
  var __axmEnvVarMessageEmitted: boolean | undefined;
}

const emitEnvVarMessage = Effect.gen(function* () {
  if (!globalThis.__axmEnvVarMessageEmitted) {
    globalThis.__axmEnvVarMessageEmitted = true;
    yield* Effect.logWarning("Authenticating via AXM_TOKEN environment variable");
  }
});

/**
 * Reset the env var message flag. For testing only.
 */
export const resetEnvVarMessageFlag = () => {
  globalThis.__axmEnvVarMessageEmitted = false;
};

// -----------------------------------------------------------------------------
// Token resolution
// -----------------------------------------------------------------------------

const PREFLIGHT_EXPIRY_WINDOW_MS = 5 * 60 * 1000;

type RefreshFailureMode = "fail" | "use-stale";

const makeStoredTokenSource = (
  registryUrl: string,
  credentials: Pick<StoredCredentials, "access_token" | "refresh_token" | "expires_at">,
) =>
  new CredentialStoreTokenSource({
    token: credentials.access_token,
    refresh_token: credentials.refresh_token,
    expires_at: credentials.expires_at,
    registryUrl,
  });

const isNearExpiry = (expiresAt: string): boolean => {
  const expiryTime = new Date(expiresAt).getTime();
  return expiryTime - Date.now() < PREFLIGHT_EXPIRY_WINDOW_MS;
};

const persistRefreshedCredentials = (registryUrl: string, token: TokenResponse) =>
  Effect.gen(function* () {
    const store = yield* CredentialStore;
    const existing = yield* store.load(registryUrl);
    const handle = Option.match(existing, {
      onNone: () => "unknown",
      onSome: (credentials) => credentials.handle,
    });

    yield* store.save(registryUrl, handle, {
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      expires_at: token.expires_at,
    });

    return makeStoredTokenSource(registryUrl, token);
  });

/**
 * Resolve a token from the credential store only.
 *
 * Looks up stored credentials by origin URL. Does not check env vars or flags.
 */
export const resolveStoredToken = (
  origin: string,
): Effect.Effect<Option.Option<CredentialStoreTokenSource>, AppError, CredentialStore> =>
  Effect.gen(function* () {
    const store = yield* CredentialStore;
    const stored = yield* store.load(origin);
    return Option.map(stored, (credentials) => makeStoredTokenSource(origin, credentials));
  });

export const refreshStoredToken = (
  tokenSource: CredentialStoreTokenSource,
  options?: { readonly onFailure?: RefreshFailureMode },
) =>
  Effect.gen(function* () {
    const authClient = yield* AuthClient;
    const mode = options?.onFailure ?? "fail";

    return yield* authClient.refreshToken(tokenSource.registryUrl, tokenSource.refresh_token).pipe(
      Effect.matchEffect({
        onFailure: (error) =>
          mode === "use-stale" ? Effect.succeed(tokenSource) : Effect.fail(error),
        onSuccess: (token) => persistRefreshedCredentials(tokenSource.registryUrl, token),
      }),
    );
  });

export const resolveStoredTokenWithRefresh = (
  origin: string,
  options?: { readonly onRefreshFailure?: RefreshFailureMode },
): Effect.Effect<Option.Option<TokenSource>, AppError, CredentialStore | AuthClient> =>
  Effect.gen(function* () {
    const stored = yield* resolveStoredToken(origin);
    if (Option.isNone(stored)) {
      return Option.none<TokenSource>();
    }

    if (!isNearExpiry(stored.value.expires_at)) {
      return Option.some<TokenSource>(stored.value);
    }

    const refreshed = yield* Option.match(Option.fromUndefinedOr(options?.onRefreshFailure), {
      onNone: () => refreshStoredToken(stored.value),
      onSome: (onFailure) => refreshStoredToken(stored.value, { onFailure }),
    });
    return Option.some<TokenSource>(refreshed);
  });

/**
 * Resolve a token from ambient sources only (env var and flag).
 *
 * Does not access the credential store.
 *
 * Precedence:
 * 1. AXM_TOKEN env var
 * 2. --token flag (passed as `flagToken` parameter)
 */
export const resolveAmbientToken = (flagToken?: string) =>
  Effect.gen(function* () {
    const envTokenOpt = yield* envOption("AXM_TOKEN");
    const envToken = Option.getOrUndefined(envTokenOpt);
    if (envToken !== undefined && envToken.length > 0) {
      yield* emitEnvVarMessage;
      return Option.some<TokenSource>(new EnvVarTokenSource({ token: envToken }));
    }
    if (flagToken !== undefined && flagToken.length > 0) {
      return Option.some<TokenSource>(new FlagTokenSource({ token: flagToken }));
    }
    return Option.none<TokenSource>();
  });

/**
 * Resolve the token that should be attached to a specific request target.
 *
 * Ambient sources are only considered for the configured default registry.
 * Stored credentials remain scoped by request origin.
 */
export const resolveRequestToken = (
  requestUrl: string,
  defaultRegistryUrl: string,
  flagToken?: string,
): Effect.Effect<Option.Option<TokenSource>, AppError, CredentialStore | AuthClient> =>
  Effect.gen(function* () {
    const requestOrigin = new URL(requestUrl).origin;
    const defaultRegistryOrigin = new URL(defaultRegistryUrl).origin;

    if (requestOrigin === defaultRegistryOrigin) {
      const ambient = yield* resolveAmbientToken(flagToken);
      if (Option.isSome(ambient)) {
        return ambient;
      }
    }

    return yield* resolveStoredTokenWithRefresh(requestOrigin, {
      onRefreshFailure: "use-stale",
    });
  });

/**
 * Resolve a token from the precedence chain.
 *
 * Precedence:
 * 1. AXM_TOKEN env var
 * 2. --token flag (passed as `flagToken` parameter)
 * 3. CredentialStore lookup by registry URL
 *
 * Returns `Option.none()` when no token is available from any source.
 */
export const resolveToken = (
  registryUrl: string,
  flagToken?: string,
): Effect.Effect<Option.Option<TokenSource>, AppError, CredentialStore | AuthClient> =>
  Effect.gen(function* () {
    const ambient = yield* resolveAmbientToken(flagToken);
    if (Option.isSome(ambient)) return ambient;
    return yield* resolveStoredTokenWithRefresh(registryUrl, { onRefreshFailure: "fail" });
  });
