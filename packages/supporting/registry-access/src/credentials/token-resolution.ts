/**
 * Token resolution with precedence chain.
 *
 * Resolves authentication tokens from multiple sources in priority order:
 * 1. AXM_TOKEN environment variable
 * 2. AXM_TOKEN_FILE
 * 3. The GitHub Actions identity, exchanged for a workload token
 * 4. The stored session for the Registry's origin
 *
 * The first three are ambient: they are presented only to the
 * settings-selected default Registry (see `ambientEligible`). Every other
 * Registry is offered its own stored session or nothing.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import { authVariableIsSet, readAuthVariable } from "../adapters/environment.js";

import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import type {
  HttpRegistryEndpoint,
  RegistryEndpoint,
} from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
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
import { ambientEligible, credentialKey } from "./credential-key.js";

// -----------------------------------------------------------------------------
// Token resolution
// -----------------------------------------------------------------------------

const makeStoredTokenSource = (
  endpoint: HttpRegistryEndpoint,
  credentials: Pick<StoredCredentials, "access_token" | "refresh_token" | "expires_at">,
) =>
  new CredentialStoreTokenSource({
    token: credentials.access_token,
    refresh_token: credentials.refresh_token,
    expires_at: credentials.expires_at,
    endpoint,
  });

/**
 * Read the locally-stored user handle for a Registry.
 *
 * Offline only — does not call the registry. Returns Option.none() when
 * persisted credentials are unsupported, no credentials are stored, or the
 * stored entry has no handle.
 */
export const getCurrentUserHandle = (
  endpoint: HttpRegistryEndpoint,
): Effect.Effect<Option.Option<Handle>, RegistryAccessFailed, CredentialStore> =>
  Effect.gen(function* () {
    const store = yield* CredentialStore;
    if (!store.allowsPersistedCredentials) {
      return Option.none<Handle>();
    }
    const stored = yield* store.load(credentialKey(endpoint));
    return Option.map(stored, (credentials) => credentials.handle);
  });

/**
 * Resolve a token from the credential store only: the stored session kept
 * under the Registry's credential key. Does not check ambient sources.
 */
export const resolveStoredToken = (
  endpoint: HttpRegistryEndpoint,
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

    const stored = yield* store.load(credentialKey(endpoint));
    return Option.map(stored, (credentials) => makeStoredTokenSource(endpoint, credentials));
  });

/**
 * The token an invocation was explicitly handed: `AXM_TOKEN`, then the file
 * `AXM_TOKEN_FILE` names. A named file that cannot be read is a failure, never
 * a reason to fall through to another source.
 */
const resolveExplicitToken = Effect.gen(function* () {
  const envTokenOpt = yield* readAuthVariable("AXM_TOKEN");
  const envToken = Option.getOrUndefined(envTokenOpt);
  if (envToken !== undefined && envToken.length > 0) {
    return Option.some<TokenSource>(new EnvVarTokenSource({ token: envToken }));
  }
  const tokenFileOpt = yield* readAuthVariable("AXM_TOKEN_FILE");
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
 * Resolve a token from ambient sources only, for a Registry already known to
 * be eligible for them. Does not access the credential store.
 *
 * Precedence:
 * 1. AXM_TOKEN env var
 * 2. AXM_TOKEN_FILE
 * 3. The GitHub Actions identity, exchanged for a workload token for
 *    `endpoint`'s origin
 */
const resolveAmbientToken = (
  endpoint: HttpRegistryEndpoint,
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
    const workload = yield* WorkloadCredentials;
    return Option.some<TokenSource>(yield* workload.tokenFor(identity.value, endpoint));
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
  if (yield* authVariableIsSet("AXM_TOKEN")) return Option.some("environment" as const);
  if (yield* authVariableIsSet("AXM_TOKEN_FILE")) return Option.some("file" as const);
  return Option.isSome(yield* githubActionsIdentity)
    ? Option.some("github-actions" as const)
    : Option.none();
});

/**
 * Whether an invocation carries a credential for a Registry, decided offline:
 * the same sources in the same precedence as `resolveRequestToken`, except
 * that a GitHub Actions identity counts as present without being exchanged.
 */
export const hasRequestCredential = (
  endpoint: HttpRegistryEndpoint,
  defaultEndpoint: RegistryEndpoint,
): Effect.Effect<boolean, RegistryAccessFailed, CredentialStore> =>
  Effect.gen(function* () {
    if (ambientEligible(endpoint, defaultEndpoint)) {
      if (Option.isSome(yield* resolveExplicitToken)) return true;
      if (Option.isSome(yield* githubActionsIdentity)) return true;
    }
    return Option.isSome(yield* resolveStoredToken(endpoint));
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
  endpoint: HttpRegistryEndpoint,
  defaultEndpoint: RegistryEndpoint,
): Effect.Effect<
  Option.Option<TokenSource>,
  RegistryAccessFailed,
  CredentialStore | WorkloadCredentials
> =>
  Effect.gen(function* () {
    if (ambientEligible(endpoint, defaultEndpoint)) {
      const explicit = yield* resolveExplicitToken;
      if (Option.isSome(explicit)) return explicit;
      if (Option.isSome(yield* githubActionsIdentity)) {
        const workload = yield* WorkloadCredentials;
        const held = yield* workload.held(endpoint);
        return Option.map(held, (token): TokenSource => token);
      }
    }

    return yield* resolveStoredToken(endpoint);
  });

/**
 * Resolve the token an operation on `endpoint` presents: the ambient sources
 * when it is the default Registry, then its stored session.
 */
export const resolveRequestToken = (
  endpoint: HttpRegistryEndpoint,
  defaultEndpoint: RegistryEndpoint,
): Effect.Effect<
  Option.Option<TokenSource>,
  RegistryAccessFailed | WorkloadTokenUnavailable,
  CredentialStore | WorkloadCredentials
> =>
  Effect.gen(function* () {
    if (ambientEligible(endpoint, defaultEndpoint)) {
      const ambient = yield* resolveAmbientToken(endpoint);
      if (Option.isSome(ambient)) return ambient;
    }

    return yield* resolveStoredToken(endpoint);
  });

/**
 * Resolve the invocation's credential for `endpoint`, or say which of the two
 * signed-out situations it is in.
 *
 * Returns the stored token as it is. Renewal belongs to the request
 * authorization and the session refresher behind it, so nothing here decides
 * whether a session is still alive.
 *
 * Where persisted credentials are disabled by policy — CI, most notably — an
 * ambient token or a GitHub Actions identity is the only way to be signed in,
 * so the refusal names that rather than a sign-in the environment cannot
 * perform. Everywhere else there is one signed-out result, with one message.
 */
export const resolveRequiredToken = (
  endpoint: HttpRegistryEndpoint,
  defaultEndpoint: RegistryEndpoint,
): Effect.Effect<
  TokenSource,
  RegistryAccessFailed | SignedOut | AuthTokenPolicyRequired | WorkloadTokenUnavailable,
  CredentialStore | WorkloadCredentials
> =>
  Effect.gen(function* () {
    const token = yield* resolveRequestToken(endpoint, defaultEndpoint);
    if (Option.isSome(token)) {
      return token.value;
    }

    const store = yield* CredentialStore;
    if (!store.allowsPersistedCredentials) {
      return yield* makePersistedCredentialsUnsupportedError();
    }

    return yield* signedOut();
  });
