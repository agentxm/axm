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
import * as Option from "effect/Option";

import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";

import { AuthClient } from "./auth-client.js";
import type { TokenPermissions } from "./tokens/permissions.js";
import { CredentialStore } from "../credentials/credential-store.js";
import { isRejectedCredential, signedOut } from "./errors.js";
import { resolveRequiredToken, resolveToken } from "../credentials/token-resolution.js";

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
}

/**
 * Read the canonical Registry identity for the resolved credential.
 *
 * A credential the Registry rejects here has already been through renewal, so
 * there is nothing left to try: the person is signed out.
 */
export const currentIdentity = Effect.fn("Identity.current")(function* (registryUrl: string) {
  const authClient = yield* AuthClient;
  yield* requireSignedIn(registryUrl);
  const identity = yield* authClient
    .getMe()
    .pipe(Effect.mapError((error) => (isRejectedCredential(error) ? signedOut(error) : error)));
  return {
    user: identity.userHandle,
    registry: registryUrl,
    credentialType: identity.tokenType,
    authority: identity.authority,
    permissions: identity.permissions,
    resourceRestrictions: identity.resourceRestrictions,
    expiresAt: identity.expiresAt,
    approvedAt: identity.approvedAt,
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
  registryUrl: string,
) {
  yield* resolveRequiredToken(registryUrl);
});

/**
 * Whether this invocation carries a credential at all.
 *
 * Reads that a signed-out person may legitimately make still answer; this
 * only decides whether signing in is worth offering as a recovery, so a
 * storage failure reads as signed out rather than becoming the result.
 */
export const isSignedIn = (registryUrl: string) =>
  resolveToken(registryUrl).pipe(
    Effect.map(Option.isSome),
    Effect.catch(() => Effect.succeed(false)),
  );

/** The token an invocation would present to the selected Registry. */
export const currentToken = Effect.fn("Identity.currentToken")(function* (registryUrl: string) {
  const token = yield* resolveRequiredToken(registryUrl);
  return token.token;
});

/** Both members keep `CredentialStore` in `R`; declared for the reader. */
export type IdentityRequirements = AuthClient | CredentialStore;
