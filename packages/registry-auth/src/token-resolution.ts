/**
 * Token resolution with precedence chain.
 *
 * Resolves authentication tokens from multiple sources in priority order:
 * 1. AXM_TOKEN environment variable
 * 2. AXM_TOKEN_FILE
 * 3. --token flag (per-command, passed as parameter)
 * 4. Credential store lookup by registry URL
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import { envOption } from "./internal/environment.js";

import { normalizeHandle, type Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import {
  authLoginRequired,
  RegistryAuthFailed,
  type AuthError,
  type AuthLoginRequired,
  type AuthTokenPolicyRequired,
} from "./errors.js";
import { AuthClient } from "./auth-client.js";
import { CredentialStore, makePersistedCredentialsUnsupportedError } from "./credential-store.js";
import type { NormalizedTokenResponse } from "./oauth-contract.js";
import {
  CredentialStoreTokenSource,
  EnvVarTokenSource,
  FileTokenSource,
  FlagTokenSource,
  type StoredCredentials,
  type TokenSource,
} from "./schema.js";

// -----------------------------------------------------------------------------
// Token resolution
// -----------------------------------------------------------------------------

const parseOrigin = (url: string) =>
  Effect.try({
    try: () => new URL(url).origin,
    catch: (error) =>
      new RegistryAuthFailed({
        category: "validation",
        detail: `Invalid URL: ${url}`,
        suggestions: [{ description: "Check the registry URL in your settings." }],
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

const persistRefreshedCredentials = (registryUrl: string, token: NormalizedTokenResponse) =>
  Effect.gen(function* () {
    const store = yield* CredentialStore;
    const existing = yield* store.load(registryUrl);
    const handle = Option.match(existing, {
      onNone: () => normalizeHandle("@unknown"),
      onSome: (credentials) => credentials.handle,
    });

    yield* store.save(registryUrl, handle, {
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      expires_at: token.expires_at,
    });

    return makeStoredTokenSource(registryUrl, token);
  });

const makeLoginRequiredError = (): AuthLoginRequired => authLoginRequired();

/**
 * Read the locally-stored user handle for the given registry URL.
 *
 * Offline only — does not call the registry. Returns Option.none() when
 * persisted credentials are unsupported, no credentials are stored, or the
 * stored entry has no handle.
 */
export const getCurrentUserHandle = (
  registryUrl: string,
): Effect.Effect<Option.Option<Handle>, RegistryAuthFailed, CredentialStore> =>
  Effect.gen(function* () {
    const store = yield* CredentialStore;
    if (!store.allowsPersistedCredentials) {
      return Option.none<Handle>();
    }
    const stored = yield* store.load(registryUrl);
    return Option.map(stored, (credentials) => credentials.handle);
  });

/**
 * Resolve a token from the credential store only.
 *
 * Looks up stored credentials by origin URL. Does not check env vars or flags.
 */
export const resolveStoredToken = (
  origin: string,
): Effect.Effect<Option.Option<CredentialStoreTokenSource>, RegistryAuthFailed, CredentialStore> =>
  Effect.gen(function* () {
    const store = yield* CredentialStore;
    if (!store.allowsPersistedCredentials) {
      return Option.none<CredentialStoreTokenSource>();
    }

    const stored = yield* store.load(origin);
    return Option.map(stored, (credentials) => makeStoredTokenSource(origin, credentials));
  });

export const refreshStoredToken = (tokenSource: CredentialStoreTokenSource) =>
  Effect.gen(function* () {
    const authClient = yield* AuthClient;

    const token = yield* authClient.refreshToken(tokenSource.refresh_token);
    return yield* persistRefreshedCredentials(tokenSource.registryUrl, token);
  });

/**
 * Resolve a token from ambient sources only (env var, file, and flag).
 *
 * Does not access the credential store.
 *
 * Precedence:
 * 1. AXM_TOKEN env var
 * 2. AXM_TOKEN_FILE
 * 3. --token flag (passed as `flagToken` parameter)
 */
export const resolveAmbientToken = (flagToken?: string) =>
  Effect.gen(function* () {
    const envTokenOpt = yield* envOption("AXM_TOKEN");
    const envToken = Option.getOrUndefined(envTokenOpt);
    if (envToken !== undefined && envToken.length > 0) {
      return Option.some<TokenSource>(new EnvVarTokenSource({ token: envToken }));
    }
    const tokenFileOpt = yield* envOption("AXM_TOKEN_FILE");
    if (Option.isSome(tokenFileOpt) && tokenFileOpt.value.length > 0) {
      const maybeFs = yield* Effect.serviceOption(FileSystem.FileSystem);
      if (Option.isNone(maybeFs)) {
        return yield* new RegistryAuthFailed({
          category: "internal",
          detail: "AXM_TOKEN_FILE cannot be read in this runtime.",
        });
      }
      const fs = maybeFs.value;
      const token = yield* fs.readFileString(tokenFileOpt.value).pipe(
        Effect.map((content) => content.trim()),
        Effect.mapError(
          (error) =>
            new RegistryAuthFailed({
              category: "auth",
              detail: `Could not read AXM_TOKEN_FILE at ${tokenFileOpt.value}.`,
              suggestions: [
                { description: "Check that AXM_TOKEN_FILE names a readable token file." },
              ],
              cause: error,
            }),
        ),
      );
      if (token.length === 0) {
        return yield* new RegistryAuthFailed({
          category: "validation",
          detail: `AXM_TOKEN_FILE at ${tokenFileOpt.value} is empty.`,
        });
      }
      return Option.some<TokenSource>(new FileTokenSource({ token, path: tokenFileOpt.value }));
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
): Effect.Effect<Option.Option<TokenSource>, RegistryAuthFailed, CredentialStore> =>
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
 * 2. AXM_TOKEN_FILE
 * 3. --token flag (passed as `flagToken` parameter)
 * 4. CredentialStore lookup by registry URL
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
): Effect.Effect<Option.Option<TokenSource>, RegistryAuthFailed, CredentialStore> =>
  Effect.gen(function* () {
    const ambient = yield* resolveAmbientToken(flagToken);
    if (Option.isSome(ambient)) return ambient;
    return yield* resolveStoredToken(registryUrl);
  });

/**
 * Resolve a token and fail with the correct auth policy error when none is available.
 *
 * In CI environments, persisted credentials are disabled by policy, so
 * callers should surface the auth policy error instead of suggesting `axm login`.
 */
export const resolveRequiredToken = (
  registryUrl: string,
  options?: {
    readonly flagToken?: string;
    readonly missingTokenError?: AuthError;
  },
): Effect.Effect<
  TokenSource,
  RegistryAuthFailed | AuthLoginRequired | AuthTokenPolicyRequired | AuthError,
  CredentialStore
> =>
  Effect.gen(function* () {
    const token = yield* resolveToken(registryUrl, options?.flagToken);
    if (Option.isSome(token)) {
      return token.value;
    }

    const store = yield* CredentialStore;
    if (!store.allowsPersistedCredentials) {
      return yield* makePersistedCredentialsUnsupportedError();
    }

    return yield* options?.missingTokenError ?? makeLoginRequiredError();
  });
