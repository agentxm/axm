/**
 * The authenticated identity of the selected Registry.
 *
 * Reading it needs only two things: a credential to present, and the
 * Registry's answer. Keeping a session alive is not one of them — the auth
 * middleware renews a stored session on the way out, so an identity read that
 * arrives here holds whatever credential the invocation actually has.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";

import { AuthClient } from "./auth-client.js";
import type { TokenPermissions } from "./tokens/permissions.js";
import { CredentialStore } from "../credentials/credential-store.js";
import { isRejectedCredential, signedOut } from "./errors.js";
import { hasRequestCredential, resolveRequiredToken } from "../credentials/token-resolution.js";
import type { WorkloadCredentials } from "../credentials/workload-credentials.js";
import type { SelectedRegistry } from "./selected-registry.js";
import type {
  HttpRegistryEndpoint,
  RegistryEndpoint,
} from "@agentxm/extension-model/unstable/extensions/registry-endpoint";

/** The Registry's canonical answer to "who is this credential". */
export interface RegistryIdentity {
  readonly user: Handle;
  readonly registry: string;
  readonly credentialType: string;
  /** `account` carries the whole account's authority; `limited` is narrowed. */
  readonly authority: "account" | "limited";
  /** What a limited credential may do, in the token vocabulary. Null otherwise. */
  readonly permissions: TokenPermissions | null;
  readonly resourceRestrictions: { readonly extensions: ReadonlyArray<string> | null } | null;
  readonly expiresAt: DateTime.Utc | null;
  /** When the sign-in that approved this CLI session authenticated. */
  readonly approvedAt: DateTime.Utc | null;
  /** The trusted publisher behind a workload token. Null otherwise. */
  readonly trustedPublisher: { readonly name: string } | null;
}

/**
 * Read the canonical Registry identity for the resolved credential.
 *
 * A credential the Registry rejects here has already been through renewal, so
 * there is nothing left to try: the person is signed out.
 */
export const currentIdentity = Effect.fn("Identity.current")(function* (
  registry: SelectedRegistry,
) {
  const authClient = yield* AuthClient;
  yield* requireSignedIn(registry);
  const identity = yield* authClient
    .getMe(registry.endpoint)
    .pipe(Effect.mapError((error) => (isRejectedCredential(error) ? signedOut(error) : error)));
  return {
    user: identity.userHandle,
    registry: registry.endpoint.href,
    credentialType: identity.tokenType,
    authority: identity.authority,
    permissions: identity.permissions,
    resourceRestrictions: identity.resourceRestrictions,
    expiresAt: identity.expiresAt,
    approvedAt: identity.approvedAt,
    trustedPublisher: identity.trustedPublisher,
  } satisfies RegistryIdentity;
});

/**
 * Refuse before the request when the invocation carries no credential at all.
 *
 * This is the signed-out half of the two states, decided locally: a person who
 * has not signed in is told so without a round trip, and everyone else goes on
 * to whatever their permissions allow.
 */
export const requireSignedIn = Effect.fn("Identity.requireSignedIn")(function* (
  registry: SelectedRegistry,
) {
  yield* resolveRequiredToken(registry.endpoint, registry.defaultEndpoint);
});

/**
 * Whether this invocation carries a credential at all.
 *
 * Reads that a signed-out person may legitimately make still answer; this
 * only decides whether signing in is worth offering as a recovery, so it is
 * decided offline and a storage failure reads as signed out rather than
 * becoming the result.
 */
export const isSignedIn = (endpoint: HttpRegistryEndpoint, defaultEndpoint: RegistryEndpoint) =>
  hasRequestCredential(endpoint, defaultEndpoint).pipe(Effect.catch(() => Effect.succeed(false)));

/** The token an invocation would present to the selected Registry. */
export const currentToken = Effect.fn("Identity.currentToken")(function* (
  registry: SelectedRegistry,
) {
  const token = yield* resolveRequiredToken(registry.endpoint, registry.defaultEndpoint);
  return token.token;
});

/** Every member keeps these in `R`; declared for the reader. */
export type IdentityRequirements = AuthClient | CredentialStore | WorkloadCredentials;
