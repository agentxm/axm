import { mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { computeIntegrity } from "../utils/index.js";
import { makeArchiveCache, resolveArchiveCacheRootPure } from "./archive-cache.js";

const withCache = <A, E>(
  use: (cacheRoot: string) => Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>,
) => {
  const tempRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-archive-cache-"));
  const cacheRoot = nodePath.join(tempRoot, "archives");
  return use(cacheRoot).pipe(
    Effect.ensuring(Effect.sync(() => rmSync(tempRoot, { recursive: true, force: true }))),
    Effect.provide(NodeServices.layer),
  );
};

describe("ArchiveCache", () => {
  it("resolves the platform-native cache root", () => {
    expect(resolveArchiveCacheRootPure(nodePath.join, "darwin", "/Users/test", {})).toBe(
      nodePath.join("/Users/test", "Library", "Caches", "axm", "archives"),
    );
    expect(
      resolveArchiveCacheRootPure(nodePath.join, "linux", "/home/test", {
        xdgCacheHome: "/var/cache/test",
      }),
    ).toBe(nodePath.join("/var/cache/test", "axm", "archives"));
    expect(
      resolveArchiveCacheRootPure(nodePath.win32.join, "win32", "C:\\Users\\test", {
        localAppData: "D:\\LocalData",
      }),
    ).toBe(nodePath.win32.join("D:\\LocalData", "axm", "cache", "archives"));
  });

  it("uses AXM_USER_HOME as a hermetic cache-home override", () => {
    expect(
      resolveArchiveCacheRootPure(nodePath.join, "linux", "/home/test", {
        axmUserHome: "/tmp/axm-home",
        xdgCacheHome: "/var/cache/test",
      }),
    ).toBe(nodePath.join("/tmp/axm-home", ".cache", "axm", "archives"));
  });

  it.effect("writes atomically and returns verified archive bytes", () =>
    withCache((cacheRoot) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const cache = makeArchiveCache(fs, path, cacheRoot);
        const archive = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
        const integrity = yield* computeIntegrity(archive);

        yield* cache.write(integrity, archive);
        const result = yield* cache.read(integrity);

        expect(Array.from(Option.getOrThrow(result))).toEqual(Array.from(archive));
        const entries = yield* fs.readDirectory(cacheRoot);
        expect(entries).toHaveLength(1);
        expect(entries[0]?.endsWith(".zip")).toBe(true);
      }),
    ),
  );

  it.effect("deletes a corrupt archive instead of returning it", () =>
    withCache((cacheRoot) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const cache = makeArchiveCache(fs, path, cacheRoot);
        const archive = new Uint8Array([1, 2, 3, 4]);
        const integrity = yield* computeIntegrity(archive);

        yield* cache.write(integrity, archive);
        const [entry] = (yield* fs.readDirectory(cacheRoot)).filter((name) =>
          name.endsWith(".zip"),
        );
        if (entry === undefined) return yield* Effect.die("Expected cache entry");
        writeFileSync(nodePath.join(cacheRoot, entry), new Uint8Array([9, 9, 9]));

        const result = yield* cache.read(integrity);

        expect(Option.isNone(result)).toBe(true);
        expect(yield* fs.exists(nodePath.join(cacheRoot, entry))).toBe(false);
      }),
    ),
  );

  it.effect("verify removes corrupt entries and reports exact totals", () =>
    withCache((cacheRoot) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const cache = makeArchiveCache(fs, path, cacheRoot);
        const first = new Uint8Array([1, 2]);
        const second = new Uint8Array([3, 4, 5]);
        const firstIntegrity = yield* computeIntegrity(first);
        const secondIntegrity = yield* computeIntegrity(second);
        yield* cache.write(firstIntegrity, first);
        yield* cache.write(secondIntegrity, second);
        const entries = (yield* fs.readDirectory(cacheRoot))
          .filter((name) => name.endsWith(".zip"))
          .sort();
        const corruptEntry = entries[0];
        if (corruptEntry === undefined) return yield* Effect.die("Expected cache entry");
        writeFileSync(nodePath.join(cacheRoot, corruptEntry), new Uint8Array([0]));

        const result = yield* cache.verify();

        expect(result).toEqual({ checked: 2, valid: 1, corruptRemoved: 1 });
        expect(yield* fs.exists(nodePath.join(cacheRoot, corruptEntry))).toBe(false);
      }),
    ),
  );

  it.effect("prunes expired entries and then enforces the size ceiling oldest-first", () =>
    withCache((cacheRoot) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const cache = makeArchiveCache(fs, path, cacheRoot, {
          maxBytes: 5,
          maxAgeMillis: 1_000,
        });
        const archives = [
          new Uint8Array([1, 1, 1]),
          new Uint8Array([2, 2, 2]),
          new Uint8Array([3, 3, 3]),
        ];
        const integrities = yield* Effect.forEach(archives, computeIntegrity);
        yield* Effect.forEach(archives, (archive, index) =>
          cache.write(integrities[index] ?? "", archive, { prune: false }),
        );
        const entries = (yield* fs.readDirectory(cacheRoot))
          .filter((name) => name.endsWith(".zip"))
          .sort();
        // Age the entries against the effect clock, which `prune` now reads.
        const now = yield* Clock.currentTimeMillis;
        const expired = entries[0];
        const older = entries[1];
        const newest = entries[2];
        if (expired === undefined || older === undefined || newest === undefined) {
          return yield* Effect.die("Expected three cache entries");
        }
        const ageEntry = (name: string, elapsedMillis: number) => {
          const mtime = new Date(now - elapsedMillis);
          utimesSync(nodePath.join(cacheRoot, name), mtime, mtime);
        };
        ageEntry(expired, 2_000);
        ageEntry(older, 500);
        ageEntry(newest, 0);

        const result = yield* cache.prune();

        expect(result).toEqual({ removed: 2, bytesFreed: 6, remaining: 1, remainingBytes: 3 });
        expect(readFileSync(nodePath.join(cacheRoot, newest))).toHaveLength(3);
      }),
    ),
  );
});
