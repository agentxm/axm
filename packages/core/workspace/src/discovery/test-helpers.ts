import * as fs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";

import * as Deferred from "effect/Deferred";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";

import { PackageTypeSchema } from "@agentxm/extension-model/unstable/packaging/package-type";
import type { PackageType } from "@agentxm/extension-model/unstable/packaging";
import { createRegistryClient, type RegistryClient } from "@agentxm/registry-client";

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
  readonly client: Effect.Effect<RegistryClient, never, FileSystem.FileSystem | Path.Path>;
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
    client: createRegistryClient(discoveryRegistryUrl).pipe(
      Effect.provideService(HttpClient.HttpClient, httpClient),
    ),
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

/** Directory content snapshot, so a read-only pipeline can be shown to write nothing. */
export const snapshotDirectory = (root: string): ReadonlyArray<readonly [string, string]> => {
  const entries: Array<readonly [string, string]> = [];
  const walk = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = nodePath.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else entries.push([nodePath.relative(root, absolute), fs.readFileSync(absolute, "utf8")]);
    }
  };
  walk(root);
  return entries.sort((left, right) => left[0].localeCompare(right[0]));
};
