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
import { envOption } from "../utils/index.js";

import { type AppError, makeAppError } from "../app-error/index.js";
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

let envVarMessageEmitted = false;

const emitEnvVarMessage = Effect.gen(function* () {
  if (!envVarMessageEmitted) {
    envVarMessageEmitted = true;
    yield* Effect.logWarning("Authenticating via AXM_TOKEN environment variable");
  }
});

/**
 * Check whether the env var message has been emitted. For testing only.
 */
export const isEnvVarMessageEmitted = () => envVarMessageEmitted;

/**
 * Reset the env var message flag. For testing only.
 */
export const resetEnvVarMessageFlag = () => {
  envVarMessageEmitted = false;
};

// -----------------------------------------------------------------------------
// Token resolution
// -----------------------------------------------------------------------------

const parseOrigin = (url: string) =>
  Effect.try({
    try: () => new URL(url).origin,
    catch: (error) =>
      makeAppError({
        code: "AUTH_INVALID_URL",
        what: `Invalid URL: ${url}`,
        howToFix: "Check the registry URL in your settings.",
        cause: error,
      }),
  });

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

export const refreshStoredToken = (tokenSource: CredentialStoreTokenSource) =>
  Effect.gen(function* () {
    const authClient = yield* AuthClient;

    const token = yield* authClient.refreshToken(
      tokenSource.registryUrl,
      tokenSource.refresh_token,
    );
    return yield* persistRefreshedCredentials(tokenSource.registryUrl, token);
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
): Effect.Effect<Option.Option<TokenSource>, AppError, CredentialStore> =>
  Effect.gen(function* () {
    const requestOrigin = yield* parseOrigin(requestUrl);
    const defaultRegistryOrigin = yield* parseOrigin(defaultRegistryUrl);

    if (requestOrigin === defaultRegistryOrigin) {
      const ambient = yield* resolveAmbientToken(flagToken);
      if (Option.isSome(ambient)) {
        return ambient;
      }
    }

    return yield* resolveStoredToken(requestOrigin);
  });

/**
 * Resolve a token from the precedence chain.
 *
 * Precedence:
 * 1. AXM_TOKEN env var
 * 2. --token flag (passed as `flagToken` parameter)
 * 3. CredentialStore lookup by registry URL
 *
 * Returns the stored token as-is without proactive refresh. Callers should
 * handle 401 responses from the server (e.g., prompt re-login). The auth
 * middleware handles automatic refresh on 401 for requests going through
 * HttpClient.
 *
 * Returns `Option.none()` when no token is available from any source.
 */
export const resolveToken = (
  registryUrl: string,
  flagToken?: string,
): Effect.Effect<Option.Option<TokenSource>, AppError, CredentialStore> =>
  Effect.gen(function* () {
    const ambient = yield* resolveAmbientToken(flagToken);
    if (Option.isSome(ambient)) return ambient;
    return yield* resolveStoredToken(registryUrl);
  });
