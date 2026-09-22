import {
  mkdtempSync,
  readFileSync,
  rmSync,
  truncateSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Clock from "effect/Clock";
import * as Deferred from "effect/Deferred";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { computeIntegrity } from "./integrity.js";
import { makeArchiveCache } from "./archive-cache.js";
import { resolveAxmCacheRootPure } from "./cache-root.js";
import { MAX_BUFFERED_ARCHIVE_BYTES } from "./archive-limits.js";
import { RegistryOperationFailed } from "./errors.js";

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
  it.effect("rejects an oversized cached archive before allocating its body", () =>
    withCache((cacheRoot) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const cache = yield* makeArchiveCache(fs, path, cacheRoot);
        const archive = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
        const integrity = yield* computeIntegrity(archive);
        yield* cache.write(integrity, archive);
        const [entry] = yield* fs.readDirectory(cacheRoot);
        if (entry === undefined) throw new Error("Expected cached archive");
        truncateSync(path.join(cacheRoot, entry), MAX_BUFFERED_ARCHIVE_BYTES + 1);

        const failure = yield* cache.read(integrity).pipe(Effect.flip);
        expect(failure.category).toBe("quota");
      }),
    ),
  );

  it("resolves the platform-native cache root", () => {
    expect(resolveAxmCacheRootPure(nodePath.join, "darwin", "/Users/test", {})).toBe(
      nodePath.join("/Users/test", "Library", "Caches", "axm"),
    );
    expect(
      resolveAxmCacheRootPure(nodePath.join, "linux", "/home/test", {
        xdgCacheHome: "/var/cache/test",
      }),
    ).toBe(nodePath.join("/var/cache/test", "axm"));
    expect(
      resolveAxmCacheRootPure(nodePath.win32.join, "win32", "C:\\Users\\test", {
        localAppData: "D:\\LocalData",
      }),
    ).toBe(nodePath.win32.join("D:\\LocalData", "axm", "cache"));
  });

  it("uses AXM_USER_HOME as a hermetic cache-home override", () => {
    expect(
      resolveAxmCacheRootPure(nodePath.join, "linux", "/home/test", {
        axmUserHome: "/tmp/axm-home",
        xdgCacheHome: "/var/cache/test",
      }),
    ).toBe(nodePath.join("/tmp/axm-home", ".cache", "axm"));
  });

  it.effect("writes atomically and returns verified archive bytes", () =>
    withCache((cacheRoot) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const cache = yield* makeArchiveCache(fs, path, cacheRoot);
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

  it.effect("coalesces one active selection and forgets a failed load for retry", () =>
    withCache((cacheRoot) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const cache = yield* makeArchiveCache(fs, path, cacheRoot);
        const archive = new Uint8Array([1, 2, 3]);
        const integrity = yield* computeIntegrity(archive);
        const started = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        const fetches = yield* Ref.make(0);
        const fetch = Ref.update(fetches, (count) => count + 1).pipe(
          Effect.andThen(Deferred.succeed(started, undefined)),
          Effect.andThen(Deferred.await(release)),
          Effect.as(archive),
        );
        const first = yield* cache.load("same-selection", integrity, fetch).pipe(Effect.forkChild);
        yield* Deferred.await(started);
        const second = yield* cache.load("same-selection", integrity, fetch).pipe(Effect.forkChild);
        yield* Effect.yieldNow;
        expect(yield* Ref.get(fetches)).toBe(1);
        yield* Deferred.succeed(release, undefined);
        expect(Array.from(yield* Fiber.join(first))).toEqual([1, 2, 3]);
        expect(Array.from(yield* Fiber.join(second))).toEqual([1, 2, 3]);

        const missing = yield* computeIntegrity(new Uint8Array([9]));
        yield* cache
          .load(
            "retry-selection",
            missing,
            Effect.fail(new RegistryOperationFailed({ category: "network", detail: "offline" })),
          )
          .pipe(Effect.exit);
        expect(
          Array.from(
            yield* cache.load("retry-selection", missing, Effect.succeed(new Uint8Array([9]))),
          ),
        ).toEqual([9]);
      }),
    ),
  );

  it.effect("interrupts waiting equal-digest callers and permits a later retry", () =>
    withCache((cacheRoot) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const cache = yield* makeArchiveCache(fs, path, cacheRoot);
        const archive = new Uint8Array([8, 7, 6]);
        const integrity = yield* computeIntegrity(archive);
        const started = yield* Deferred.make<void>();
        const leader = yield* cache
          .load(
            "selection",
            integrity,
            Deferred.succeed(started, undefined).pipe(Effect.andThen(Effect.never)),
          )
          .pipe(Effect.forkChild);
        yield* Deferred.await(started);
        const waiter = yield* cache
          .load("selection", integrity, Effect.die("duplicate transfer"))
          .pipe(Effect.forkChild);
        yield* Effect.yieldNow;
        yield* Fiber.interrupt(leader);
        expect(Exit.isFailure(yield* Fiber.await(waiter))).toBe(true);
        expect(
          Array.from(yield* cache.load("selection", integrity, Effect.succeed(archive))),
        ).toEqual([8, 7, 6]);
      }),
    ),
  );

  it.effect("amortizes pruning while protecting an active archive", () =>
    withCache((cacheRoot) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const cache = yield* makeArchiveCache(fs, path, cacheRoot, { maxBytes: 5 });
        const archives = [
          new Uint8Array([1, 1, 1]),
          new Uint8Array([2, 2, 2]),
          new Uint8Array([3, 3, 3]),
          new Uint8Array([4, 4, 4]),
        ];
        const integrities = yield* Effect.forEach(archives, computeIntegrity);
        const activeArchive = archives[0];
        const activeIntegrity = integrities[0];
        if (activeArchive === undefined || activeIntegrity === undefined) {
          return yield* Effect.die("Expected active archive");
        }
        const started = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        const active = yield* cache
          .load(
            "active-selection",
            activeIntegrity,
            cache
              .write(activeIntegrity, activeArchive, { prune: false })
              .pipe(
                Effect.andThen(Deferred.succeed(started, undefined)),
                Effect.andThen(Deferred.await(release)),
                Effect.as(activeArchive),
              ),
          )
          .pipe(Effect.forkChild);
        yield* Deferred.await(started);
        for (let index = 1; index < archives.length; index++) {
          const archive = archives[index];
          const integrity = integrities[index];
          if (archive === undefined || integrity === undefined) continue;
          yield* cache.write(integrity, archive);
        }
        expect((yield* cache.status()).entries).toBe(4);
        yield* cache.write(activeIntegrity, activeArchive);
        expect(Option.isSome(yield* cache.read(activeIntegrity))).toBe(true);
        yield* Deferred.succeed(release, undefined);
        yield* Fiber.join(active);
      }),
    ),
  );

  it.effect("deletes a corrupt archive instead of returning it", () =>
    withCache((cacheRoot) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const cache = yield* makeArchiveCache(fs, path, cacheRoot);
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
        const cache = yield* makeArchiveCache(fs, path, cacheRoot);
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
        const cache = yield* makeArchiveCache(fs, path, cacheRoot, {
          maxBytes: 5,
          maxAge: Duration.seconds(1),
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
