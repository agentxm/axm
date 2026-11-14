/**
 * Which archive buffer instance reaches the filesystem when the archive cache
 * and the file Registry stage an archive.
 *
 * A freshly fetched archive and a publish request's archive are lent to the
 * atomic writer without a copy; bytes handed to the public cache write are
 * still copied, because their caller keeps them.
 */

import { describe, expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { computeIntegrity } from "@agentxm/host-primitives";
import { makeRecordingFileSystem } from "@agentxm/test-support";
import { makeArchiveCache } from "./archive-cache.js";
import { exactVersion, extensionName, handle, localRegistryClient } from "./test-helpers.js";

/**
 * Records every primitive call and, per path, each byte buffer instance that
 * `writeFile` receives. `FileSystem.make` rebuilds the derived methods over the
 * recorded `writeFile`.
 */
const observeWrites = (base: FileSystem.FileSystem) => {
  const { fileSystem: recorded, recording } = makeRecordingFileSystem(base);
  const instances = new Map<string, Array<Uint8Array>>();
  const fileSystem = FileSystem.make({
    ...recorded,
    writeFile: (path, data, options) => {
      instances.set(path, [...(instances.get(path) ?? []), data]);
      return recorded.writeFile(path, data, options);
    },
  });
  /** Buffers written to generated atomic-write temps of `targetPath`. */
  const stagedFor = (targetPath: string): ReadonlyArray<Uint8Array> =>
    [...instances.entries()]
      .filter(([path]) => path.startsWith(`${targetPath}.tmp.`))
      .flatMap(([, written]) => written);
  const reset = () => {
    recording.reset();
    instances.clear();
  };
  return { fileSystem, recording, stagedFor, reset };
};

describe("Archive write ownership", () => {
  it.effect("stages a freshly fetched archive without copying it", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "axm-archive-ownership-" });
      const observed = observeWrites(fs);
      const cache = yield* makeArchiveCache(observed.fileSystem, path, root);
      const fetched = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
      const integrity = yield* computeIntegrity(fetched);
      observed.reset();

      const delivery = yield* cache.load(
        "selection",
        integrity,
        Effect.sync(() => fetched),
      );

      const [entryName] = (yield* fs.readDirectory(root)).filter((name) => name.endsWith(".zip"));
      if (entryName === undefined) throw new Error("Expected a cached archive");
      const entryPath = path.join(root, entryName);
      const staged = observed.stagedFor(entryPath);
      expect(staged).toHaveLength(1);
      expect(staged[0]).toBe(fetched);
      expect(observed.recording.calls({ method: "rename" })).toHaveLength(1);
      expect(Array.from(yield* fs.readFile(entryPath))).toEqual(Array.from(fetched));
      expect(delivery.archive).toBe(fetched);
      expect(Array.from(fetched)).toEqual([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("copies bytes handed to the public cache write", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "axm-archive-ownership-" });
      const observed = observeWrites(fs);
      const cache = yield* makeArchiveCache(observed.fileSystem, path, root);
      const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 4, 5, 6]);
      const integrity = yield* computeIntegrity(bytes);
      observed.reset();

      yield* cache.write(integrity, bytes);

      const [entryName] = (yield* fs.readDirectory(root)).filter((name) => name.endsWith(".zip"));
      if (entryName === undefined) throw new Error("Expected a cached archive");
      const entryPath = path.join(root, entryName);
      const staged = observed.stagedFor(entryPath);
      expect(staged).toHaveLength(1);
      expect(staged[0]).not.toBe(bytes);
      expect(Array.from(yield* fs.readFile(entryPath))).toEqual(Array.from(bytes));
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("stages a published archive without copying it", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "axm-publish-ownership-" });
      const observed = observeWrites(fs);
      const client = localRegistryClient(root, observed.fileSystem, path);
      const archive = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 7, 8, 9]);
      const args = {
        owner: handle("@test"),
        type: "skill",
        name: extensionName("owned"),
        version: exactVersion("1.0.0"),
        archive,
        metadata: {
          version: exactVersion("1.0.0"),
          published: DateTime.makeUnsafe("2025-01-01T00:00:00Z"),
          integrity: yield* computeIntegrity(archive),
          packages: [],
        },
        visibilityInput: { intent: null, request: null },
      } as const;
      observed.reset();

      yield* client.publishExtension(args);

      const archivePath = path.join(root, "extensions", "@test", "skills", "owned", "1.0.0.zip");
      const staged = observed.stagedFor(archivePath);
      expect(staged).toHaveLength(1);
      expect(staged[0]).toBe(args.archive);
      expect(observed.recording.calls({ method: "rename", path: archivePath })).toHaveLength(1);
      expect(Array.from(yield* fs.readFile(archivePath))).toEqual(Array.from(archive));
      expect(Array.from(archive)).toEqual([0x50, 0x4b, 0x03, 0x04, 7, 8, 9]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
