/**
 * @agentxm/extension-discovery deterministic test ports and fixtures.
 *
 * Discovery reads a project directory and consults the Registry through the
 * `RegistryClientFactory` port; both of those become fixtures here. A
 * throwaway project the real detectors read as-is, a directory snapshot that
 * proves a read-only query wrote nothing, and the recorded Registry transport
 * this package's own dependency publishes, composed so a test provides one
 * layer. Production source never imports this module.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import type * as Path from "effect/Path";

import { RegistryClientFactory } from "@agentxm/registry-client";
import {
  RegistryUrlTest,
  makeRecordedRegistryTransport,
  testRegistryUrl,
  type ObservedRegistryRequest,
  type RegistryResponseFixture,
} from "@agentxm/registry-client/testing";

export { testRegistryUrl } from "@agentxm/registry-client/testing";
export type {
  ObservedRegistryRequest,
  RegistryResponseFixture,
} from "@agentxm/registry-client/testing";

export interface DiscoveryProject {
  readonly root: string;
  /** Writes one JSON file, creating the directories it needs. */
  readonly writeJson: (relativePath: string, value: unknown) => void;
  /** Writes one text file, creating the directories it needs. */
  readonly writeFile: (relativePath: string, contents: string) => void;
  /** Every file under the project, path and content, sorted by path. */
  readonly snapshot: () => ReadonlyArray<readonly [string, string]>;
  readonly cleanup: () => void;
}

/** A throwaway project directory the package detectors read as-is. */
export const makeDiscoveryProject = (): DiscoveryProject => {
  const root = fs.realpathSync(fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-discover-")));
  const writeFile = (relativePath: string, contents: string): void => {
    const file = nodePath.join(root, relativePath);
    fs.mkdirSync(nodePath.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  };
  return {
    root,
    writeJson: (relativePath, value) =>
      writeFile(relativePath, `${JSON.stringify(value, null, 2)}\n`),
    writeFile,
    snapshot: () => snapshotDirectory(root),
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
};

/**
 * Directory content snapshot. Taking one before and after a query is how a
 * read-only pipeline is shown to have written nothing, rather than asserted to.
 */
export const snapshotDirectory = (root: string): ReadonlyArray<readonly [string, string]> => {
  const entries: Array<readonly [string, string]> = [];
  const walk = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = nodePath.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else entries.push([nodePath.relative(root, absolute), fs.readFileSync(absolute, "utf8")]);
    }
  };
  walk(root);
  return entries.sort((left, right) => left[0].localeCompare(right[0]));
};

export interface DiscoveryRegistryPort {
  /** Every Registry request the run issued, in order. */
  readonly requests: ReadonlyArray<ObservedRegistryRequest>;
  /** Resolves as soon as the run issues its first Registry request. */
  readonly firstRequest: Effect.Effect<void>;
  /**
   * The Registry client factory `DiscoverExtensions.query` keeps in `R`. The
   * platform services stay in the layer's own requirements, so a test composes
   * the same file system the product runs on.
   */
  readonly layer: Layer.Layer<RegistryClientFactory, never, FileSystem.FileSystem | Path.Path>;
}

/**
 * The Registry seam discovery consults, recorded. Nothing leaves the process,
 * so `requests` is the complete account of what the run asked for — including
 * the fact that a project with no detectable packages asked for nothing.
 */
export const DiscoveryRegistryTest = (
  respond: (request: ObservedRegistryRequest) => RegistryResponseFixture = () => ({
    body: { packages: [] },
  }),
  registryUrl: string = testRegistryUrl,
): DiscoveryRegistryPort => {
  const transport = makeRecordedRegistryTransport(respond);
  return {
    requests: transport.requests,
    firstRequest: transport.firstRequest,
    layer: transport.factory.pipe(Layer.provide(RegistryUrlTest(registryUrl))),
  };
};
