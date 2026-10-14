/**
 * The Registry this invocation authenticates against.
 *
 * Which Registry is selected is transport configuration, so the selection
 * itself belongs to the Registry client. What a caller needs from it is an
 * authentication concern: the endpoint every use case in this package takes,
 * the default Registry that decides whether ambient credentials apply, and
 * the host a person is told they are signing in to, signing out of, or
 * identified on.
 *
 * Authentication needs a server, so a file Registry is refused here — before
 * any token source, credential store, browser, or network is touched.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import type {
  HttpRegistryEndpoint,
  RegistryEndpoint,
} from "@agentxm/extension-model/unstable/extensions/registry-endpoint";

import {
  RegistryContext,
  requireHttpRegistryEndpoint,
  type RegistryOperationUnsupported,
  type RegistrySelectionFailure,
} from "@agentxm/registry-client";

/** The selected Registry, as an endpoint and as a host a person reads. */
export interface SelectedRegistry {
  /** The Registry every registry-access use case addresses. */
  readonly endpoint: HttpRegistryEndpoint;
  /** The settings-selected default Registry, which alone receives ambient credentials. */
  readonly defaultEndpoint: RegistryEndpoint;
  /** The host, for the operation names and result documents that show it. */
  readonly host: string;
}

/**
 * Select the Registry an authentication operation addresses, refusing one
 * whose transport cannot authenticate. `operation` names it in that refusal.
 */
export const selectedRegistry = (
  operation: string,
): Effect.Effect<
  SelectedRegistry,
  RegistrySelectionFailure | RegistryOperationUnsupported,
  RegistryContext
> =>
  Effect.gen(function* () {
    const context = yield* RegistryContext;
    const bound = yield* context.bound;
    const defaultBound = yield* context.defaultBound;
    const endpoint = yield* requireHttpRegistryEndpoint(bound.endpoint, "auth", operation);
    return {
      endpoint,
      defaultEndpoint: defaultBound.endpoint,
      host: new URL(endpoint.href).host,
    } satisfies SelectedRegistry;
  });
