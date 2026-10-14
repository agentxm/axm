/**
 * The Registry a published-extension operation addresses.
 *
 * Every lifecycle and visibility command works on the invocation's selected
 * Registry, through a client the factory builds for the capability the
 * operation needs. A file Registry implements visibility but no lifecycle
 * management, so a lifecycle operation against one is refused here, before
 * any request, credential, or file is touched.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";

import { RegistryClientFactory, RegistryContext } from "@agentxm/registry-client";

/** Lifecycle management on the selected Registry, with the endpoint results report. */
export const selectedLifecycleRegistry = Effect.fn("PublishedLifecycle.registry")(function* (
  operation: string,
) {
  const bound = yield* (yield* RegistryContext).bound;
  const lifecycle = yield* (yield* RegistryClientFactory).lifecycle(bound.endpoint, operation);
  return { registry: bound.endpoint.href, lifecycle };
});

/** A visibility client for the selected Registry, with the endpoint results report. */
export const selectedVisibilityRegistry = Effect.fn("PublishedVisibility.registry")(function* () {
  const bound = yield* (yield* RegistryContext).bound;
  const client = yield* (yield* RegistryClientFactory).forEndpoint(bound.endpoint);
  return { registry: bound.endpoint.href, client };
});
