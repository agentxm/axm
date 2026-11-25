import * as Effect from "effect/Effect";

import { decodeRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import {
  RegistryClientFactory,
  type RegistryClient,
  type RegistryClientFactoryService,
} from "@agentxm/registry-client";
import {
  makeRecordedRegistryTransport,
  type ObservedRegistryRequest,
  type RegistryResponseFixture,
} from "@agentxm/registry-client/testing";

export const registryFactoryForClient = (
  client: RegistryClient,
  observeLocation: (location: string) => void = () => undefined,
): RegistryClientFactoryService => ({
  authorityContext: () => Effect.die("Unexpected Registry authority lookup"),
  withReadPhase: (effect) => effect,
  invalidateReadPhase: Effect.void,
  forEndpoint: (endpoint) =>
    Effect.sync(() => {
      observeLocation(endpoint.href);
      return client;
    }),
  lifecycle: () => Effect.die("Discovery never manages a Registry's lifecycle"),
  wire: () => Effect.die("Discovery never authenticates with a Registry"),
});

const discoveryRegistryUrl = "https://discovery-registry.example.test";

/**
 * A recorded Registry port: an HTTP client that records every request the
 * discovery pipeline issues and answers with the supplied fixture.
 */
export const makeRecordedRegistryPort = (
  respond: (request: ObservedRegistryRequest) => RegistryResponseFixture,
) => {
  const transport = makeRecordedRegistryTransport(respond);
  return {
    requests: transport.requests,
    /** Resolves as soon as the pipeline issues its first Registry request. */
    firstRequest: transport.firstRequest,
    client: Effect.gen(function* () {
      const factory = yield* RegistryClientFactory;
      return yield* factory.forEndpoint(decodeRegistryEndpointSync(discoveryRegistryUrl));
    }).pipe(Effect.provide(transport.factory)),
  };
};
