/**
 * Offline credential-presence probe.
 *
 * Answers "could this invocation be missing a private item because it is not
 * signed in to that origin?" without contacting any Registry. A successful
 * ambient or stored token suppresses the hint even when that identity cannot
 * see the requested item.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { CredentialStore } from "./credential-store.js";
import { resolveRequestToken } from "./token-resolution.js";

const remoteOrigins = (locations: ReadonlyArray<string>): ReadonlyArray<string> => {
  const origins = new Set<string>();
  for (const location of locations) {
    try {
      const url = new URL(location);
      if (url.protocol === "http:" || url.protocol === "https:") origins.add(url.origin);
    } catch {
      // Invalid source locations are reported by their owning resolution path.
    }
  }
  return [...origins];
};

/**
 * Whether every remote origin among `locations` already has a credential this
 * invocation would present. False when at least one does not.
 */
export const hasCredentialsForAll = (
  locations: ReadonlyArray<string>,
  defaultRegistryUrl: string,
): Effect.Effect<boolean, never, CredentialStore> =>
  Effect.forEach(remoteOrigins(locations), (origin) =>
    resolveRequestToken(origin, defaultRegistryUrl).pipe(
      Effect.map(Option.isSome),
      Effect.catch(() => Effect.succeed(false)),
    ),
  ).pipe(Effect.map((present) => present.every((hasCredential) => hasCredential)));
