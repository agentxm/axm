/**
 * Token resolution with precedence chain.
 *
 * Resolves authentication tokens from multiple sources in priority order:
 * 1. AXM_TOKEN environment variable
 * 2. AXM_TOKEN_FILE
 * 3. The GitHub Actions identity, exchanged for a workload token
 * 4. Credential store lookup by registry URL
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import { envOption } from "../adapters/environment.js";

import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import {
  RegistryAccessFailed,
  signedOut,
  type AuthTokenPolicyRequired,
  type SignedOut,
  type WorkloadTokenUnavailable,
} from "../authentication/errors.js";
import { CredentialStore, makePersistedCredentialsUnsupportedError } from "./credential-store.js";
import {
  CredentialStoreTokenSource,
  EnvVarTokenSource,
  FileTokenSource,
  type StoredCredentials,
  type TokenSource,
} from "./schema.js";
import { WorkloadCredentials, githubActionsIdentity } from "./workload-credentials.js";

// -----------------------------------------------------------------------------
// Token resolution
// -----------------------------------------------------------------------------

const parseOrigin = (url: string) =>
  Effect.try({
    try: () => new URL(url).origin,
    catch: (error) =>
      new RegistryAccessFailed({
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

/**
 * Read the locally-stored user handle for the given registry URL.
 *
 * Offline only — does not call the registry. Returns Option.none() when
 * persisted credentials are unsupported, no credentials are stored, or the
 * stored entry has no handle.
 */
export const getCurrentUserHandle = (
  registryUrl: string,
): Effect.Effect<Option.Option<Handle>, RegistryAccessFailed, CredentialStore> =>
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
): Effect.Effect<
  Option.Option<CredentialStoreTokenSource>,
  RegistryAccessFailed,
  CredentialStore
> =>
  Effect.gen(function* () {
    const store = yield* CredentialStore;
    if (!store.allowsPersistedCredentials) {
      return Option.none<CredentialStoreTokenSource>();
    }

    const stored = yield* store.load(origin);
    return Option.map(stored, (credentials) => makeStoredTokenSource(origin, credentials));
  });

/**
 * The token an invocation was explicitly handed: `AXM_TOKEN`, then the file
 * `AXM_TOKEN_FILE` names. A named file that cannot be read is a failure, never
 * a reason to fall through to another source.
 */
const resolveExplicitToken = Effect.gen(function* () {
  const envTokenOpt = yield* envOption("AXM_TOKEN");
  const envToken = Option.getOrUndefined(envTokenOpt);
  if (envToken !== undefined && envToken.length > 0) {
    return Option.some<TokenSource>(new EnvVarTokenSource({ token: envToken }));
  }
  const tokenFileOpt = yield* envOption("AXM_TOKEN_FILE");
  if (Option.isSome(tokenFileOpt) && tokenFileOpt.value.length > 0) {
    const maybeFs = yield* Effect.serviceOption(FileSystem.FileSystem);
    if (Option.isNone(maybeFs)) {
      return yield* new RegistryAccessFailed({
        category: "internal",
        detail: "AXM_TOKEN_FILE cannot be read in this runtime.",
      });
    }
    const fs = maybeFs.value;
    const token = yield* fs.readFileString(tokenFileOpt.value).pipe(
      Effect.map((content) => content.trim()),
      Effect.mapError(
        (error) =>
          new RegistryAccessFailed({
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
      return yield* new RegistryAccessFailed({
        category: "validation",
        detail: `AXM_TOKEN_FILE at ${tokenFileOpt.value} is empty.`,
      });
    }
    return Option.some<TokenSource>(new FileTokenSource({ token, path: tokenFileOpt.value }));
  }
  return Option.none<TokenSource>();
});

/**
 * Resolve a token from ambient sources only.
 *
 * Does not access the credential store.
 *
 * Precedence:
 * 1. AXM_TOKEN env var
 * 2. AXM_TOKEN_FILE
 * 3. The GitHub Actions identity, exchanged for a workload token for
 *    `registryUrl`'s origin
 */
export const resolveAmbientToken = (
  registryUrl: string,
): Effect.Effect<
  Option.Option<TokenSource>,
  RegistryAccessFailed | WorkloadTokenUnavailable,
  WorkloadCredentials
> =>
  Effect.gen(function* () {
    const explicit = yield* resolveExplicitToken;
    if (Option.isSome(explicit)) return explicit;
    const identity = yield* githubActionsIdentity;
    if (Option.isNone(identity)) return Option.none<TokenSource>();
    const origin = yield* parseOrigin(registryUrl);
    const workload = yield* WorkloadCredentials;
    return Option.some<TokenSource>(yield* workload.tokenFor(identity.value, origin));
  });

/** Where an invocation's ambient credential for its default Registry comes from. */
export type AmbientCredentialSource = "environment" | "file" | "github-actions";

/**
 * Which ambient source the default Registry's credential comes from, decided
 * offline in the precedence `resolveAmbientToken` applies: no file is read and
 * nothing is exchanged. None when the credential, if any, is a stored session.
 */
export const ambientCredentialSource: Effect.Effect<
  Option.Option<AmbientCredentialSource>,
  RegistryAccessFailed
> = Effect.gen(function* () {
  const isSet = (value: Option.Option<string>) => Option.exists(value, (text) => text.length > 0);
  if (isSet(yield* envOption("AXM_TOKEN"))) return Option.some("environment" as const);
  if (isSet(yield* envOption("AXM_TOKEN_FILE"))) return Option.some("file" as const);
  return Option.isSome(yield* githubActionsIdentity)
    ? Option.some("github-actions" as const)
    : Option.none();
});

/**
 * Whether an invocation carries a credential for a request target, decided
 * offline: the same sources in the same precedence as `resolveRequestToken`,
 * except that a GitHub Actions identity counts as present without being
 * exchanged.
 */
export const hasRequestCredential = (
  requestUrl: string,
  defaultRegistryUrl: string,
): Effect.Effect<boolean, RegistryAccessFailed, CredentialStore> =>
  Effect.gen(function* () {
    const requestOrigin = yield* parseOrigin(requestUrl);
    const defaultRegistryOrigin = yield* parseOrigin(defaultRegistryUrl);
    if (requestOrigin === defaultRegistryOrigin) {
      if (Option.isSome(yield* resolveExplicitToken)) return true;
      if (Option.isSome(yield* githubActionsIdentity)) return true;
    }
    return Option.isSome(yield* resolveStoredToken(requestOrigin));
  });

/**
 * The token the transport presents on a request, without starting an
 * exchange: the same sources in the same precedence as `resolveRequestToken`,
 * except that a GitHub Actions identity contributes only a workload token a
 * command already obtained. Until a command needs a credential, a job that
 * offers an identity reads anonymously, so a job granted `id-token: write`
 * for another purpose still reads what anyone may.
 */
export const resolvePresentedToken = (
  requestUrl: string,
  defaultRegistryUrl: string,
): Effect.Effect<
  Option.Option<TokenSource>,
  RegistryAccessFailed,
  CredentialStore | WorkloadCredentials
> =>
  Effect.gen(function* () {
    const requestOrigin = yield* parseOrigin(requestUrl);
    const defaultRegistryOrigin = yield* parseOrigin(defaultRegistryUrl);

    if (requestOrigin === defaultRegistryOrigin) {
      const explicit = yield* resolveExplicitToken;
      if (Option.isSome(explicit)) return explicit;
      if (Option.isSome(yield* githubActionsIdentity)) {
        const workload = yield* WorkloadCredentials;
        const held = yield* workload.held(defaultRegistryOrigin);
        return Option.map(held, (token): TokenSource => token);
      }
    }

    return yield* resolveStoredToken(requestOrigin);
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
): Effect.Effect<
  Option.Option<TokenSource>,
  RegistryAccessFailed | WorkloadTokenUnavailable,
  CredentialStore | WorkloadCredentials
> =>
  Effect.gen(function* () {
    const requestOrigin = yield* parseOrigin(requestUrl);
    const defaultRegistryOrigin = yield* parseOrigin(defaultRegistryUrl);

    if (requestOrigin === defaultRegistryOrigin) {
      const ambient = yield* resolveAmbientToken(defaultRegistryOrigin);
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
 * 3. The GitHub Actions identity, exchanged for a workload token
 * 4. CredentialStore lookup by registry URL
 *
 * Returns the stored token as it is. Renewal belongs to the auth middleware
 * and the session refresher behind it, so nothing here decides whether a
 * session is still alive.
 *
 * Returns `Option.none()` when no token is available from any source.
 */
export const resolveToken = (
  registryUrl: string,
): Effect.Effect<
  Option.Option<TokenSource>,
  RegistryAccessFailed | WorkloadTokenUnavailable,
  CredentialStore | WorkloadCredentials
> =>
  Effect.gen(function* () {
    const ambient = yield* resolveAmbientToken(registryUrl);
    if (Option.isSome(ambient)) return ambient;
    return yield* resolveStoredToken(registryUrl);
  });

/**
 * Resolve the invocation's credential, or say which of the two signed-out
 * situations it is in.
 *
 * Where persisted credentials are disabled by policy — CI, most notably — an
 * ambient token or a GitHub Actions identity is the only way to be signed in,
 * so the refusal names that
 * rather than a sign-in the environment cannot perform. Everywhere else there
 * is one signed-out result, with one message.
 */
export const resolveRequiredToken = (
  registryUrl: string,
): Effect.Effect<
  TokenSource,
  RegistryAccessFailed | SignedOut | AuthTokenPolicyRequired | WorkloadTokenUnavailable,
  CredentialStore | WorkloadCredentials
> =>
  Effect.gen(function* () {
    const token = yield* resolveToken(registryUrl);
    if (Option.isSome(token)) {
      return token.value;
    }

    const store = yield* CredentialStore;
    if (!store.allowsPersistedCredentials) {
      return yield* makePersistedCredentialsUnsupportedError();
    }

    return yield* signedOut();
  });
