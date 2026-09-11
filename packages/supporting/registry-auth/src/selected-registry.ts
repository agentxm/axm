/**
 * The Registry this invocation authenticates against.
 *
 * Which Registry is selected is transport configuration, so the value itself
 * belongs to the Registry client. What a caller needs from it is an
 * authentication concern: the endpoint every use case in this package takes,
 * and the host a person is told they are signing in to, signing out of, or
 * identified on. Publishing both here is what lets a caller name the selected
 * Registry without reaching into the transport package for its configuration
 * tag.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";

import { RegistryUrl } from "@agentxm/registry-client";

/** The selected Registry, as an endpoint and as a host a person reads. */
export interface SelectedRegistry {
  /** The endpoint every registry-auth use case takes. */
  readonly url: string;
  /** The host, for the operation names and result documents that show it. */
  readonly host: string;
}

/** Read the selected Registry's endpoint and its human-readable host. */
export const selectedRegistry: Effect.Effect<SelectedRegistry, never, RegistryUrl> = Effect.map(
  RegistryUrl,
  (url) => ({ url, host: new URL(url).host }),
);
