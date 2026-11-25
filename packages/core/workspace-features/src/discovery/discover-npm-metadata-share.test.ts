import * as nodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Logger from "effect/Logger";
import { makeRecordingFileSystem } from "@agentxm/test-support";

import { discover } from "./discover.js";
import { makeRecordedRegistryPort, registryFactoryForClient } from "./test-helpers.js";
import { makeDiscoveryProject } from "./testing.js";

/**
 * Discover over a real project directory whose installed npm dependencies are
 * written by `files`, counting the reads of each installed package.json.
 */
const discoverInstalled = (
  dependencies: Readonly<Record<string, string>>,
  files: Readonly<Record<string, unknown>>,
) => {
  const project = makeDiscoveryProject();
  project.writeJson("package.json", { dependencies });
  for (const [relativePath, value] of Object.entries(files)) {
    project.writeJson(relativePath, value);
  }
  const registry = makeRecordedRegistryPort(() => ({ body: { results: [] } }));
  const warnings: Array<string> = [];
  const logger = Logger.make((entry) => {
    if (entry.logLevel === "Warn") warnings.push(String(entry.message));
  });
  return Effect.gen(function* () {
    const client = yield* registry.client;
    const recorder = makeRecordingFileSystem(yield* FileSystem.FileSystem);
    const result = yield* discover(project.root, registryFactoryForClient(client)).pipe(
      Effect.provideService(FileSystem.FileSystem, recorder.fileSystem),
      Effect.provide(Logger.layer([logger])),
    );
    const installed = (name: string) =>
      recorder.recording.counts(nodePath.join(project.root, "node_modules", name, "package.json"));
    return {
      result,
      installed,
      warnings,
      requests: registry.requests.map((request) => request.body),
      root: project.root,
    };
  }).pipe(
    Effect.provide(NodeServices.layer),
    Effect.ensuring(Effect.sync(() => project.cleanup())),
  );
};

describe("Discover installed npm metadata", () => {
  it.effect("reads each installed package.json once for detection and recommendations", () =>
    Effect.gen(function* () {
      const outcome = yield* discoverInstalled(
        { react: "18.2.0", vite: "^5" },
        {
          "node_modules/react/package.json": {
            name: "react",
            version: "18.2.0",
            agentExtensions: [{ ref: "@acme/skills/react-review" }],
          },
          "node_modules/vite/package.json": { name: "vite", version: "5.0.0" },
        },
      );
      expect(outcome.installed("react")).toEqual({ access: 1, readFile: 1 });
      expect(outcome.installed("vite")).toEqual({ access: 1, readFile: 1 });
      expect(outcome.result.totalDetected).toBe(2);
      expect(
        outcome.result.packages.map((entry) => [
          entry.detectedPackage.name,
          entry.detectedPackage.version,
          entry.extensions.map((extension) => extension.ref),
        ]),
      ).toEqual([["react", "18.2.0", ["@acme/skills/react-review"]]]);
      expect(outcome.requests).toEqual([
        {
          client: { axmVersion: "0.0.0" },
          packages: [
            {
              purl: "pkg:npm/react",
              version: "18.2.0",
              declaredExtensions: [
                {
                  ref: "@acme/skills/react-review",
                  source: { type: "registry", url: "https://registry.agentxm.ai/" },
                },
              ],
            },
          ],
        },
      ]);
      expect(outcome.warnings).toEqual([]);
    }),
  );

  it.effect("reads nothing installed for a dependency that is not installed", () =>
    Effect.gen(function* () {
      const outcome = yield* discoverInstalled({ react: "18.2.0" }, {});
      expect(outcome.installed("react")).toEqual({ access: 1 });
      expect(outcome.result.totalDetected).toBe(1);
      expect(outcome.result.packages).toEqual([]);
      expect(outcome.requests).toEqual([]);
    }),
  );

  it.effect("keeps one warning for installed metadata whose identity is invalid", () =>
    Effect.gen(function* () {
      const outcome = yield* discoverInstalled(
        { react: "18.2.0" },
        { "node_modules/react/package.json": { name: "react", version: "not-a-version" } },
      );
      expect(outcome.installed("react")).toEqual({ access: 1, readFile: 1 });
      expect(outcome.warnings).toEqual([
        `Invalid installed package identity in ${nodePath.join(outcome.root, "node_modules/react/package.json")}, skipping`,
      ]);
      expect(outcome.result.totalDetected).toBe(1);
      expect(outcome.result.packages).toEqual([]);
    }),
  );
});
