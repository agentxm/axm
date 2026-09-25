/**
 * RegistryClientFactory — the port features ask for a Registry client.
 *
 * Constructing a client needs transport services (HTTP, file system, path)
 * that belong to the composition root, and the location a client speaks to is
 * a workspace decision (the configured default registry, or a named
 * configured registry source). Features therefore keep this factory in `R` and
 * never build a client themselves.
 *
 * The factory is also the one place a configured location becomes what a
 * client speaks to: a `file:` URL becomes the native filesystem path it names
 * (percent-decoded, so `file:///tmp/my%20registry` is `/tmp/my registry`),
 * and an HTTP(S) URL is the request base as written.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as ServiceMap from "effect/Context";
import type * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as HttpClient from "effect/unstable/http/HttpClient";

import type { RegistryClient } from "./client.js";
import { createRegistryClient } from "./client.js";
import { stripFileProtocol } from "./fs-helpers.js";
import { RegistryUrl } from "./registry-url.js";

export interface RegistryClientFactoryService {
  /** A client for one registry location: an HTTP(S) URL, a `file:` URL, or a path. */
  readonly forLocation: (
    location: URL | string,
  ) => Effect.Effect<RegistryClient, Config.ConfigError>;
  /** A client for the configured default registry. */
  readonly forDefaultRegistry: Effect.Effect<RegistryClient, Config.ConfigError>;
}

export class RegistryClientFactory extends ServiceMap.Service<
  RegistryClientFactory,
  RegistryClientFactoryService
>()("@agentxm/registry-client/registry-client-factory/RegistryClientFactory") {}

/** The location a client is constructed over: a native path for `file:`, else the URL as written. */
const clientLocation = (location: URL | string): string =>
  stripFileProtocol(location instanceof URL ? location.href : location);

export const makeRegistryClientFactory = (services: {
  readonly httpClient: HttpClient.HttpClient;
  readonly fileSystem: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly defaultRegistryLocation: string;
}): RegistryClientFactoryService => {
  const forLocation = (location: URL | string): Effect.Effect<RegistryClient, Config.ConfigError> =>
    createRegistryClient(clientLocation(location)).pipe(
      Effect.provideService(HttpClient.HttpClient, services.httpClient),
      Effect.provideService(FileSystem.FileSystem, services.fileSystem),
      Effect.provideService(Path.Path, services.path),
    );
  return { forLocation, forDefaultRegistry: forLocation(services.defaultRegistryLocation) };
};

/**
 * The transport services are bound once, here, at the composition root; every
 * member the factory hands out is already `R = never`.
 */
export const RegistryClientFactoryLive: Layer.Layer<
  RegistryClientFactory,
  never,
  HttpClient.HttpClient | FileSystem.FileSystem | Path.Path | RegistryUrl
> = Layer.effect(
  RegistryClientFactory,
  Effect.gen(function* () {
    return makeRegistryClientFactory({
      httpClient: yield* HttpClient.HttpClient,
      fileSystem: yield* FileSystem.FileSystem,
      path: yield* Path.Path,
      defaultRegistryLocation: yield* RegistryUrl,
    });
  }),
);
