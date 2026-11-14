/**
 * How a publish reads an authored manifest while it prepares.
 *
 * The canonical observation that places a declared package already reads its
 * manifest; the publish identity is derived from that text rather than from a
 * second read, and dependency expansion reuses the identity's own decoded
 * dependencies. The candidate decode, the publication gate and the archive
 * preparation keep their own reads, and the apply's revalidation reads afresh.
 */

import * as fs from "node:fs";
import * as nodePath from "node:path";

import { makeRecordingFileSystem, type RecordedFileSystemMethod } from "@agentxm/test-support";
import {
  WorkspaceReadViews,
  computePackManifestContentIdentity,
} from "@agentxm/workspace-kernel/workspace-state";
import { afterEach, describe, expect, it } from "@effect/vitest";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

import { previewOrApply, prepare } from "./use-case.js";
import {
  makePublishWorld,
  publishDocument,
  requestFor,
  type PublishWorld,
} from "../test-helpers.js";
import type { PublishRequest } from "./model.js";
import { applyPlanExecution } from "@agentxm/workspace-kernel/operations";

/** A Registry pack accepted from the named `team` source, declaring no members. */
const acceptedRegistryPack = Effect.map(
  computePackManifestContentIdentity({
    owner: "@acme",
    type: "pack",
    name: "bundle",
    version: "1.0.0",
    dependencies: {},
  }),
  (identity) => `version = 1
[[package]]
id = "registry.example.test/@acme/packs/bundle"
source = { registry = "https://registry.example.test" }
version = "1.0.0"
archive = "sha512-${"A".repeat(86)}=="
publisher = "publisher-1"
tree = "sha256-tree-v2:${"1".repeat(64)}"
manifest-version = "1.0.0"
manifest-identity = "${identity}"
dependencies = []
[packs.bundle]
package = "registry.example.test/@acme/packs/bundle"
name = "@acme/packs/bundle"
`,
);

const apply = applyPlanExecution({
  approval: "preapproved",
  acceptedPolicies: new Set(),
  recovery: { command: [], arguments: [] },
});

/**
 * Prepare and, when ready, apply one request with every filesystem port the
 * publish uses — ambient and live-observation — recorded, returning the calls
 * that named `path` in each phase.
 */
const recordPublish = (world: PublishWorld, request: PublishRequest, path: string) =>
  world.provide(
    Effect.gen(function* () {
      const views = yield* WorkspaceReadViews;
      const { fileSystem, recording } = makeRecordingFileSystem(yield* FileSystem.FileSystem);
      const recorded = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        effect.pipe(
          Effect.provideService(FileSystem.FileSystem, fileSystem),
          Effect.provideService(WorkspaceReadViews, {
            ...views,
            liveObservations: Context.add(
              views.liveObservations,
              FileSystem.FileSystem,
              fileSystem,
            ),
          }),
        );
      const methods = (): ReadonlyArray<RecordedFileSystemMethod> =>
        recording.calls({ path }).map(({ method }) => method);
      recording.reset();
      const preparation = yield* recorded(prepare(request)).pipe(Effect.result);
      const prepared = methods();
      if (preparation._tag === "Failure" || preparation.success._tag !== "Ready")
        return { preparation, prepared, applied: undefined };
      recording.reset();
      const outcome = yield* recorded(previewOrApply(preparation.success.candidate, apply));
      return { preparation, prepared, applied: methods(), outcome };
    }),
  );

/** Archive preparation inspects the manifest as an entry and reads it into the distribution. */
const walkedManifest: ReadonlyArray<RecordedFileSystemMethod> = [
  "readLink",
  "stat",
  "readLink",
  "stat",
  "readFile",
];

describe("Publish identity from the observed manifest", () => {
  const worlds: Array<PublishWorld> = [];
  afterEach(() => {
    for (const world of worlds.splice(0)) world.cleanup();
  });

  it.effect("an authored package's identity is settled from the observed manifest text", () =>
    Effect.gen(function* () {
      const world = makePublishWorld({ settings: { rules: { review: "workspace" } } });
      worlds.push(world);
      const manifestPath = nodePath.join(world.write("rule", { name: "review" }), "rule.json");

      const run = yield* recordPublish(world, requestFor(world, { preview: false }), manifestPath);

      expect(run.prepared).toEqual([
        "readFile", // canonical observation, whose text also settles the identity
        "readFile", // candidate decode
        "access", // publication gate
        ...walkedManifest,
      ]);
      // The apply's revalidation observes the sources afresh, exactly as before.
      expect(run.applied).toEqual([
        "readLink",
        "stat",
        "readFile",
        "readLink",
        "stat",
        "readFile",
        ...walkedManifest,
        "readLink",
        "stat",
        "readFile",
      ]);
      expect(
        run.outcome === undefined ? undefined : publishDocument(run.outcome).counts,
      ).toMatchObject({ published: 1 });
    }),
  );

  it.effect("dependency expansion reuses the selected pack's decoded dependencies", () =>
    Effect.gen(function* () {
      const world = makePublishWorld({
        settings: { skills: { review: "workspace" }, packs: { toolkit: "workspace" } },
      });
      worlds.push(world);
      world.write("skill", { name: "review" });
      const manifestPath = nodePath.join(
        world.write("pack", { name: "toolkit", dependencies: { "@acme/skills/review": "^1.0.0" } }),
        "pack.json",
      );

      const run = yield* recordPublish(
        world,
        requestFor(world, {
          selectors: ["@acme/packs/toolkit"],
          includeDependencies: true,
          preview: false,
        }),
        manifestPath,
      );

      expect(run.prepared).toEqual([
        "readFile", // desired-graph pack document
        "readFile", // canonical observation, whose text also settles the identity and its dependencies
        "readFile", // candidate decode
        "access", // publication gate
        ...walkedManifest,
      ]);
      expect(
        run.outcome === undefined ? undefined : publishDocument(run.outcome).counts,
      ).toMatchObject({ published: 2 });
    }),
  );

  it.effect("a pack whose identity comes from its source still reads its manifest to expand", () =>
    Effect.gen(function* () {
      const world = makePublishWorld({
        settings: {
          sources: [{ name: "team", type: "registry", location: "https://registry.example.test" }],
          packs: { bundle: "team:@acme/packs/bundle" },
        },
      });
      worlds.push(world);
      fs.writeFileSync(nodePath.join(world.root, "axm.lock"), yield* acceptedRegistryPack);
      const packageDir = nodePath.join(
        world.root,
        "agent_extensions",
        "registry.example.test",
        "@acme",
        "packs",
        "bundle",
      );
      fs.mkdirSync(packageDir, { recursive: true });
      const manifestPath = nodePath.join(packageDir, "pack.json");
      fs.writeFileSync(manifestPath, "{");

      const run = yield* recordPublish(
        world,
        requestFor(world, {
          selectors: ["@acme/packs/bundle"],
          includeDependencies: true,
          preview: false,
        }),
        manifestPath,
      );

      // The canonical observation reads the manifest, and so does expansion:
      // an identity taken from the source declares no dependencies of its own.
      expect(run.prepared).toEqual(["readFile", "readFile"]);
      expect(run.preparation._tag).toBe("Failure");
      if (run.preparation._tag !== "Failure") return;
      expect(run.preparation.failure).toMatchObject({
        category: "validation",
        detail: "Invalid pack manifest for @acme/packs/bundle",
      });
    }),
  );
});
