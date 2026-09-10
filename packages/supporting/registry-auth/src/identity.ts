/**
 * The authenticated identity of the selected Registry, and the credential
 * lifecycle rule that governs reading it: a stored credential the Registry
 * rejects is refreshed once and the read is retried, while a rejected ambient
 * credential is reported as sign-in required.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import { isRegistryClientFailure } from "@agentxm/registry-client";
import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";

import { AuthClient } from "./auth-client.js";
import { CredentialStore } from "./credential-store.js";
import { authLoginRequired } from "./errors.js";
import { refreshStoredToken, resolveRequiredToken } from "./token-resolution.js";

/** The Registry's canonical answer to "who is this credential". */
export interface RegistryIdentity {
  readonly user: Handle;
  readonly registry: string;
  readonly credentialType: string;
  readonly scopes: ReadonlyArray<string>;
  readonly resourceRestrictions: { readonly extensions: ReadonlyArray<string> | null };
  readonly expiresAt: DateTime.Utc | null;
}

const isRejectedCredential = (error: unknown): boolean =>
  isRegistryClientFailure(error) && error.metadata?.response?.status === 401;

/**
 * Read the canonical Registry identity for the resolved credential.
 *
 * Only a credential this workspace stores can be refreshed: an ambient token
 * the Registry rejects is the caller's to replace, so it maps to sign-in
 * required rather than a silent refresh attempt.
 */
export const currentIdentity = Effect.fn("Identity.current")(function* (registryUrl: string) {
  const authClient = yield* AuthClient;
  const token = yield* resolveRequiredToken(registryUrl, {
    missingTokenError: authLoginRequired("Not authenticated"),
  });
  const identity = yield* authClient.getMe(token.token).pipe(
    Effect.catch((error) =>
      token._tag === "CredentialStore" && isRejectedCredential(error)
        ? refreshStoredToken(token).pipe(
            Effect.flatMap((refreshed) => authClient.getMe(refreshed.token)),
          )
        : Effect.fail(error),
    ),
    Effect.mapError((error) =>
      isRejectedCredential(error)
        ? authLoginRequired("Invalid or expired credential. Authenticate again.", error)
        : error,
    ),
  );
  return {
    user: identity.userHandle,
    registry: registryUrl,
    credentialType: identity.tokenType,
    scopes: identity.scopes,
    resourceRestrictions: identity.resourceRestrictions,
    expiresAt: identity.expiresAt,
  } satisfies RegistryIdentity;
});

/** The token an invocation would present to the selected Registry. */
export const currentToken = Effect.fn("Identity.currentToken")(function* (registryUrl: string) {
  const token = yield* resolveRequiredToken(registryUrl, {
    missingTokenError: authLoginRequired("No token available"),
  });
  return token.token;
});

/** Both members keep `CredentialStore` in `R`; declared for the reader. */
export type IdentityRequirements = AuthClient | CredentialStore;
