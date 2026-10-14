/**
 * RegistryClientFactory — the one place a Registry client is built.
 *
 * Constructing a client needs transport services (HTTP, file system, path)
 * that belong to the composition root, and which Registry a client speaks to
 * is a workspace decision. Features therefore keep this factory in `R` and
 * ask it for a client by validated endpoint; they never build a client
 * themselves.
 *
 * Every transport's client serves reads, publication, and visibility; a file
 * Registry implements nothing that needs a server, so `lifecycle` and `wire`
 * check the endpoint's transport before building anything and refuse a file
 * Registry before any request, credential, or file is touched. An HTTP(S)
 * client travels on the Registry transport, confined to its origin, refusing
 * redirects, and authorized for that origin alone; a file client is opened at
 * the native directory its `file:` URL names (percent-decoded, so
 * `file:///tmp/my%20registry` is `/tmp/my registry`).
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as ServiceMap from "effect/Context";
import type * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import type * as HttpClient from "effect/http/HttpClient";
import { fromFileLocation } from "@agentxm/host-primitives";
import {
  isHttpRegistryEndpoint,
  type HttpRegistryEndpoint,
  type RegistryEndpoint,
} from "@agentxm/extension-model/unstable/extensions/registry-endpoint";

import type { RegistryClient } from "./client.js";
import { makeUserArchiveCache } from "./archive-cache.js";
import { createLocalRegistryClient } from "./local-client.js";
import { createRemoteRegistryClient } from "./remote-client.js";
import { makeRegistryLifecycleClient, type RegistryLifecycleClient } from "./admin-client.js";
import { requireHttpRegistryEndpoint } from "./capabilities.js";
import type { RegistryOperationUnsupported } from "./errors.js";
import type { RegistryRequestPolicy } from "./request-policy.js";
import {
  RegistryHttpClient,
  RegistryRequestAuthorization,
  registryWire,
  type RegistryRequestAuthorizationService,
} from "./registry-transport.js";

export interface RegistryClientFactoryService {
  /**
   * A client for one Registry. Every transport serves its reads,
   * publication, and visibility, so building one is never refused.
   */
  readonly forEndpoint: (
    endpoint: RegistryEndpoint,
    options?: { readonly requestPolicy?: RegistryRequestPolicy },
  ) => Effect.Effect<RegistryClient, Config.ConfigError>;
  /** Lifecycle management for one Registry; refused for a file Registry. */
  readonly lifecycle: (
    endpoint: RegistryEndpoint,
    operation: string,
  ) => Effect.Effect<RegistryLifecycleClient, RegistryOperationUnsupported>;
  /**
   * The authorized transport an HTTP(S) Registry's authentication API
   * travels on: confined to its origin, refusing redirects, and presenting
   * the invocation's credential. Refused for a file Registry.
   */
  readonly wire: (
    endpoint: RegistryEndpoint,
    options: { readonly operation: string },
  ) => Effect.Effect<
    { readonly endpoint: HttpRegistryEndpoint; readonly httpClient: HttpClient.HttpClient },
    RegistryOperationUnsupported
  >;
}

export class RegistryClientFactory extends ServiceMap.Service<
  RegistryClientFactory,
  RegistryClientFactoryService
>()("@agentxm/registry-client/registry-client-factory/RegistryClientFactory") {}

/**
 * Build the factory over the Registry transport. Every HTTP(S) client it
 * builds travels on `authorization` applied to the plain Registry wire.
 */
export const makeRegistryClientFactory = (services: {
  readonly httpClient: HttpClient.HttpClient;
  readonly fileSystem: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly authorization: RegistryRequestAuthorizationService;
}): RegistryClientFactoryService => {
  const transport = (endpoint: HttpRegistryEndpoint) =>
    services.authorization.authorize(endpoint, registryWire(endpoint, services.httpClient));

  const forEndpoint: RegistryClientFactoryService["forEndpoint"] = (endpoint, options) =>
    Effect.gen(function* () {
      if (!isHttpRegistryEndpoint(endpoint)) {
        return createLocalRegistryClient(
          fromFileLocation(endpoint.href),
          services.fileSystem,
          services.path,
        );
      }
      const archiveCache = yield* makeUserArchiveCache().pipe(
        Effect.provideService(FileSystem.FileSystem, services.fileSystem),
        Effect.provideService(Path.Path, services.path),
      );
      return createRemoteRegistryClient(
        endpoint,
        transport(endpoint),
        archiveCache,
        options?.requestPolicy,
      );
    });

  return {
    forEndpoint,
    lifecycle: (endpoint, operation) =>
      Effect.map(requireHttpRegistryEndpoint(endpoint, "lifecycle", operation), (http) =>
        makeRegistryLifecycleClient(http, transport(http)),
      ),
    wire: (endpoint, options) =>
      Effect.map(requireHttpRegistryEndpoint(endpoint, "auth", options.operation), (http) => ({
        endpoint: http,
        httpClient: transport(http),
      })),
  };
};

/**
 * The authorized factory every feature uses. The transport services are
 * bound once, here, at the composition root; every member the factory hands
 * out is already `R = never`.
 */
export const RegistryClientFactoryLive: Layer.Layer<
  RegistryClientFactory,
  never,
  RegistryHttpClient | RegistryRequestAuthorization | FileSystem.FileSystem | Path.Path
> = Layer.effect(
  RegistryClientFactory,
  Effect.gen(function* () {
    return makeRegistryClientFactory({
      httpClient: yield* RegistryHttpClient,
      fileSystem: yield* FileSystem.FileSystem,
      path: yield* Path.Path,
      authorization: yield* RegistryRequestAuthorization,
    });
  }),
);
