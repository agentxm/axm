import * as fs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";

import * as Deferred from "effect/Deferred";
import type * as Config from "effect/Config";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";

import { PackageTypeSchema } from "@agentxm/extension-model/unstable/packaging/package-type";
import type { PackageType } from "@agentxm/extension-model/unstable/packaging";
import {
  makeRegistryClientFactory,
  type RegistryClient,
  type RegistryClientFactoryService,
} from "@agentxm/registry-client";

export const registryFactoryForClient = (
  client: RegistryClient,
  observeLocation: (location: string) => void = () => undefined,
): RegistryClientFactoryService => ({
  forLocation: (location) =>
    Effect.sync(() => {
      observeLocation(location instanceof URL ? location.href : location);
      return client;
    }),
  forDefaultRegistry: Effect.succeed(client),
});

export const packageType = (value: string): PackageType =>
  Schema.decodeUnknownSync(PackageTypeSchema)(value);

export const discoveryRegistryUrl = "https://discovery-registry.example.test";

export interface ObservedRegistryRequest {
  readonly method: string;
  readonly url: string;
  readonly body: unknown;
}

export interface RegistryResponseFixture {
  readonly status?: number;
  readonly body: unknown;
}

/**
 * A recorded Registry port: an HTTP client that records every request the
 * discovery pipeline issues and answers with the supplied fixture.
 */
export const makeRecordedRegistryPort = (
  respond: (request: ObservedRegistryRequest) => RegistryResponseFixture,
): {
  readonly requests: ReadonlyArray<ObservedRegistryRequest>;
  readonly client: Effect.Effect<
    RegistryClient,
    Config.ConfigError,
    FileSystem.FileSystem | Path.Path
  >;
  /** Resolves as soon as the pipeline issues its first Registry request. */
  readonly firstRequest: Effect.Effect<void>;
} => {
  const requests: Array<ObservedRegistryRequest> = [];
  const firstRequest = Deferred.makeUnsafe<void>();
  const httpClient = HttpClient.make((request) =>
    Effect.gen(function* () {
      const observed: ObservedRegistryRequest = {
        method: request.method,
        url: request.url,
        body:
          request.body._tag === "Uint8Array"
            ? JSON.parse(new TextDecoder().decode(request.body.body))
            : undefined,
      };
      requests.push(observed);
      yield* Deferred.succeed(firstRequest, undefined);
      const fixture = respond(observed);
      return HttpClientResponse.fromWeb(
        request,
        new Response(JSON.stringify(fixture.body), {
          status: fixture.status ?? 200,
          headers: { "content-type": "application/json" },
        }),
      );
    }),
  );
  return {
    requests,
    firstRequest: Deferred.await(firstRequest),
    client: Effect.gen(function* () {
      const factory = makeRegistryClientFactory({
        httpClient,
        fileSystem: yield* FileSystem.FileSystem,
        path: yield* Path.Path,
        defaultRegistryLocation: discoveryRegistryUrl,
      });
      return yield* factory.forLocation(discoveryRegistryUrl);
    }),
  };
};

export interface TemporaryProject {
  readonly root: string;
  readonly writeJson: (relativePath: string, value: unknown) => void;
  readonly cleanup: () => void;
}

/** A throwaway project directory the package detectors read as-is. */
export const makeTemporaryProject = (): TemporaryProject => {
  const root = fs.realpathSync(fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-discover-")));
  return {
    root,
    writeJson: (relativePath, value) => {
      const file = nodePath.join(root, relativePath);
      fs.mkdirSync(nodePath.dirname(file), { recursive: true });
      fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
    },
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
};
