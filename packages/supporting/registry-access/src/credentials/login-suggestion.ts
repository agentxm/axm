/**
 * Offline credential-presence probe.
 *
 * Answers "could this invocation be missing a private item because it is not
 * signed in to that Registry?" without contacting any Registry. A successful
 * ambient or stored token suppresses the hint even when that identity cannot
 * see the requested item.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import {
  isHttpRegistryEndpoint,
  sameRegistryEndpoint,
  type HttpRegistryEndpoint,
  type RegistryEndpoint,
} from "@agentxm/extension-model/unstable/extensions/registry-endpoint";

import { CredentialStore } from "./credential-store.js";
import { hasRequestCredential } from "./token-resolution.js";

const remoteEndpoints = (
  endpoints: ReadonlyArray<RegistryEndpoint>,
): ReadonlyArray<HttpRegistryEndpoint> =>
  endpoints
    .filter(isHttpRegistryEndpoint)
    .filter(
      (endpoint, index, all) =>
        all.findIndex((other) => sameRegistryEndpoint(other, endpoint)) === index,
    );

/**
 * Whether every HTTP(S) Registry among `endpoints` already has a credential
 * this invocation would present. False when at least one does not.
 */
export const hasCredentialsForAll = (
  endpoints: ReadonlyArray<RegistryEndpoint>,
  defaultEndpoint: RegistryEndpoint,
): Effect.Effect<boolean, never, CredentialStore> =>
  Effect.forEach(remoteEndpoints(endpoints), (endpoint) =>
    hasRequestCredential(endpoint, defaultEndpoint).pipe(Effect.catch(() => Effect.succeed(false))),
  ).pipe(Effect.map((present) => present.every((hasCredential) => hasCredential)));
