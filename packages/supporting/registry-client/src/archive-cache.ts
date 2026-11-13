/**
 * Verified, content-addressed cache for registry ZIP archives.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Cache from "effect/Cache";
import type * as Config from "effect/Config";
import * as Equal from "effect/Equal";
import * as Hash from "effect/Hash";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import { RegistryOperationFailed, type RegistryClientFailure } from "./errors.js";
import { computeIntegrity, resolveAxmCacheRoot, writeFileAtomic } from "@agentxm/host-primitives";
import { annotateWork, withWork } from "@agentxm/host-primitives/work-observation";
import { MAX_BUFFERED_ARCHIVE_BYTES, readBufferedArchive } from "./archive-limits.js";

const ARCHIVE_CACHE_MAX_BYTES = 2 * 1024 * 1024 * 1024;
const ARCHIVE_CACHE_MAX_AGE = Duration.days(90);

export interface ArchiveCacheOptions {
  readonly maxBytes?: number;
  readonly maxAge?: Duration.Duration;
}

interface ArchiveCacheStatus {
  readonly entries: number;
  readonly bytes: number;
  readonly maxBytes: number;
  readonly maxAgeDays: number;
}

interface ArchiveCacheVerifyResult {
  readonly checked: number;
  readonly valid: number;
  readonly corruptRemoved: number;
}

interface ArchiveCachePruneResult {
  readonly removed: number;
  readonly bytesFreed: number;
  readonly remaining: number;
  readonly remainingBytes: number;
}

export interface ArchiveCache {
  /** Coalesce equal byte acquisitions after the caller has admitted content access. */
  readonly load: (
    selectionKey: string,
    integrity: string,
    fetch: Effect.Effect<Uint8Array, RegistryClientFailure>,
  ) => Effect.Effect<Uint8Array, RegistryClientFailure>;
  readonly read: (
    integrity: string,
  ) => Effect.Effect<Option.Option<Uint8Array>, RegistryClientFailure>;
  readonly write: (
    integrity: string,
    archive: Uint8Array,
    options?: { readonly prune?: boolean },
  ) => Effect.Effect<void, RegistryClientFailure>;
  readonly status: () => Effect.Effect<ArchiveCacheStatus, RegistryClientFailure>;
  readonly verify: () => Effect.Effect<ArchiveCacheVerifyResult, RegistryClientFailure>;
  readonly prune: () => Effect.Effect<ArchiveCachePruneResult, RegistryClientFailure>;
}

interface CacheEntry {
  readonly path: string;
  readonly integrity: string | undefined;
  readonly size: number;
  readonly accessedAt: DateTime.Utc;
}

/** The first caller supplies work; only complete selection identity determines sharing. */
class ArchiveAcquisition implements Equal.Equal {
  lookupStarted = false;
  constructor(
    readonly selectionKey: string,
    readonly integrity: string,
    readonly fetch: Effect.Effect<Uint8Array, RegistryClientFailure>,
  ) {}

  [Equal.symbol](other: unknown): boolean {
    return (
      other instanceof ArchiveAcquisition &&
      this.selectionKey === other.selectionKey &&
      this.integrity === other.integrity
    );
  }

  [Hash.symbol](): number {
    return Hash.combine(Hash.string(this.integrity))(Hash.string(this.selectionKey));
  }
}

const cacheError = (detail: string, cause?: unknown): RegistryOperationFailed =>
  new RegistryOperationFailed({
    category: "internal",
    detail,
    ...(cause === undefined ? {} : { cause }),
  });

const cacheFileName = (integrity: string): string | undefined => {
  if (!integrity.startsWith("sha512-") || integrity.length === "sha512-".length) return undefined;
  const base64Url = integrity
    .slice("sha512-".length)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
  return `${base64Url}.zip`;
};

const integrityFromFileName = (fileName: string): string | undefined => {
  if (!fileName.endsWith(".zip")) return undefined;
  const base64Url = fileName.slice(0, -".zip".length);
  if (base64Url.length === 0 || !/^[A-Za-z0-9_-]+$/.test(base64Url)) return undefined;
  const remainder = base64Url.length % 4;
  const padding = remainder === 0 ? "" : "=".repeat(4 - remainder);
  return `sha512-${base64Url.replaceAll("-", "+").replaceAll("_", "/")}${padding}`;
};

const verifyArchiveIntegrity = (archive: Uint8Array) =>
  computeIntegrity(archive).pipe((effect) =>
    withWork("axm.archive.integrity", effect, {
      attributes: {
        "axm.archive.bytes": archive.byteLength,
        "axm.work.executed": 1,
      },
    }),
  );

export const makeArchiveCache = Effect.fnUntraced(function* (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  root: string,
  options: ArchiveCacheOptions = {},
): Effect.fn.Return<ArchiveCache> {
  const maxBytes = options.maxBytes ?? ARCHIVE_CACHE_MAX_BYTES;
  const maxAge = options.maxAge ?? ARCHIVE_CACHE_MAX_AGE;
  const active = yield* Ref.make(new Map<string, number>());
  const writesSincePrune = yield* Ref.make(0);

  const acquireActive = (integrity: string) =>
    Ref.update(active, (current) => {
      const next = new Map(current);
      next.set(integrity, (next.get(integrity) ?? 0) + 1);
      return next;
    });
  const releaseActive = (integrity: string) =>
    Ref.update(active, (current) => {
      const next = new Map(current);
      const count = next.get(integrity) ?? 0;
      if (count <= 1) next.delete(integrity);
      else next.set(integrity, count - 1);
      return next;
    });

  const pathForIntegrity = (integrity: string): Effect.Effect<string, RegistryClientFailure> => {
    const fileName = cacheFileName(integrity);
    return fileName === undefined
      ? Effect.fail(cacheError(`Unsupported archive integrity value: ${integrity}`))
      : Effect.succeed(path.join(root, fileName));
  };

  const listEntries = Effect.fnUntraced(function* (): Effect.fn.Return<
    ReadonlyArray<CacheEntry>,
    RegistryClientFailure
  > {
    const exists = yield* fs.exists(root).pipe(Effect.orElseSucceed(() => false));
    if (!exists) return [];
    const names = yield* fs
      .readDirectory(root)
      .pipe(
        Effect.mapError((cause) => cacheError(`Failed to inspect archive cache: ${root}`, cause)),
      );
    return yield* Effect.forEach(
      names.filter((name) => name.endsWith(".zip")),
      (name) =>
        Effect.gen(function* () {
          const entryPath = path.join(root, name);
          const info = yield* fs
            .stat(entryPath)
            .pipe(
              Effect.mapError((cause) =>
                cacheError(`Failed to inspect cache entry: ${entryPath}`, cause),
              ),
            );
          return {
            path: entryPath,
            integrity: integrityFromFileName(name),
            size: Number(info.size),
            accessedAt: Option.match(info.mtime, {
              onNone: () => DateTime.makeUnsafe(0),
              onSome: (mtime) => DateTime.makeUnsafe(mtime),
            }),
          } satisfies CacheEntry;
        }),
      { concurrency: 16 },
    );
  });

  const removeEntry = (entryPath: string) =>
    fs
      .remove(entryPath)
      .pipe(
        Effect.mapError((cause) => cacheError(`Failed to remove cache entry: ${entryPath}`, cause)),
      );

  const prune = (trigger: "automatic" | "explicit") =>
    Effect.suspend(() => {
      const removed: Array<CacheEntry> = [];
      return Effect.gen(function* () {
        const now = yield* DateTime.now;
        const entries = [...(yield* listEntries())].sort((a, b) =>
          DateTime.Order(a.accessedAt, b.accessedAt),
        );
        yield* Effect.annotateCurrentSpan("axm.cache.entries-scanned", entries.length);
        let retainedBytes = entries.reduce((total, entry) => total + entry.size, 0);
        for (const entry of entries) {
          if (!Duration.isGreaterThan(DateTime.distance(entry.accessedAt, now), maxAge)) continue;
          if (entry.integrity !== undefined && (yield* Ref.get(active)).has(entry.integrity))
            continue;
          yield* removeEntry(entry.path);
          removed.push(entry);
          retainedBytes -= entry.size;
        }
        const removedPaths = new Set(removed.map((entry) => entry.path));
        for (const entry of entries) {
          if (retainedBytes <= maxBytes) break;
          if (removedPaths.has(entry.path)) continue;
          if (entry.integrity !== undefined && (yield* Ref.get(active)).has(entry.integrity))
            continue;
          yield* removeEntry(entry.path);
          removed.push(entry);
          retainedBytes -= entry.size;
        }
        return {
          removed: removed.length,
          bytesFreed: removed.reduce((total, entry) => total + entry.size, 0),
          remaining: entries.length - removed.length,
          remainingBytes: retainedBytes,
        } satisfies ArchiveCachePruneResult;
      }).pipe(
        Effect.onExit(() =>
          Effect.annotateCurrentSpan({
            "axm.cache.entries-removed": removed.length,
            "axm.cache.bytes-freed": removed.reduce((total, entry) => total + entry.size, 0),
          }),
        ),
        Effect.withSpan("axm.archive.cache-prune", {
          attributes: { "axm.cache.prune.trigger": trigger },
        }),
      );
    });

  const read = Effect.fnUntraced(
    function* (
      integrity: string,
    ): Effect.fn.Return<Option.Option<Uint8Array>, RegistryClientFailure> {
      const entryPath = yield* pathForIntegrity(integrity);
      const exists = yield* fs.exists(entryPath).pipe(Effect.orElseSucceed(() => false));
      if (!exists) {
        yield* annotateWork({ "axm.cache.outcome": "miss" });
        return Option.none();
      }
      const archive = yield* readBufferedArchive(fs, entryPath).pipe(
        Effect.mapError((cause) =>
          cause instanceof RegistryOperationFailed
            ? cause
            : cacheError(`Failed to read cache entry: ${entryPath}`, cause),
        ),
      );
      const actualIntegrity = yield* verifyArchiveIntegrity(archive);
      if (actualIntegrity !== integrity) {
        yield* annotateWork({ "axm.cache.outcome": "corrupt" });
        yield* removeEntry(entryPath);
        return Option.none();
      }
      const now = DateTime.toDateUtc(yield* DateTime.now);
      yield* fs.utimes(entryPath, now, now).pipe(Effect.ignore);
      yield* annotateWork({
        "axm.cache.outcome": "hit",
        "axm.archive.bytes": archive.byteLength,
      });
      return Option.some(archive);
    },
    (effect) => withWork("axm.archive.cache-read", effect),
  );

  const write = Effect.fnUntraced(
    function* (
      integrity: string,
      archive: Uint8Array,
      writeOptions: { readonly prune?: boolean } = {},
    ): Effect.fn.Return<void, RegistryClientFailure> {
      if (archive.byteLength > MAX_BUFFERED_ARCHIVE_BYTES) {
        return yield* new RegistryOperationFailed({
          category: "quota",
          detail: `Registry archive exceeds the ${MAX_BUFFERED_ARCHIVE_BYTES} byte acquisition limit`,
        });
      }
      const actualIntegrity = yield* verifyArchiveIntegrity(archive);
      if (actualIntegrity !== integrity) {
        return yield* new RegistryOperationFailed({
          category: "validation",
          detail: "Downloaded registry archive did not match its published integrity.",
        });
      }
      const entryPath = yield* pathForIntegrity(integrity);
      yield* fs
        .makeDirectory(root, { recursive: true })
        .pipe(
          Effect.mapError((cause) => cacheError(`Failed to create archive cache: ${root}`, cause)),
        );
      yield* writeFileAtomic(fs, {
        targetPath: entryPath,
        content: archive,
        removeTargetBeforeRename: true,
        mapError: (failure) =>
          failure.step === "rename"
            ? cacheError(`Failed to commit cache entry: ${entryPath}`, failure.cause)
            : cacheError("Failed to write archive cache temp file", failure.cause),
      });
      if (writeOptions.prune !== false) {
        const shouldPrune = yield* Ref.modify(writesSincePrune, (count) => {
          const next = (count + 1) % 4;
          return [next === 0, next] as const;
        });
        if (shouldPrune) yield* prune("automatic");
      }
    },
    (effect) => withWork("axm.archive.cache-write", effect),
  );

  const inFlight = yield* Cache.make({
    lookup: (request: ArchiveAcquisition) => {
      request.lookupStarted = true;
      return Effect.acquireUseRelease(
        acquireActive(request.integrity),
        () =>
          Effect.gen(function* () {
            const cached = yield* read(request.integrity);
            if (Option.isSome(cached)) {
              return cached.value;
            }
            const archive = yield* request.fetch;
            yield* write(request.integrity, archive);
            return archive;
          }),
        () => releaseActive(request.integrity),
      );
    },
    // This invocation-owned table holds only active calls, never completed bytes
    // or failures. Operation admission budgets bound downstream work. Pending
    // entries must not be evicted, which would admit a second load for the key.
    capacity: Infinity,
    timeToLive: Duration.zero,
    requireServicesAt: "lookup",
  });

  const load: ArchiveCache["load"] = (selectionKey, integrity, fetch) =>
    Effect.suspend(() => {
      const request = new ArchiveAcquisition(selectionKey, integrity, fetch);
      return Cache.get(inFlight, request).pipe(
        Effect.onExit((exit) =>
          annotateWork({
            "axm.work.executed": request.lookupStarted ? 1 : 0,
            // A shared success or failure was reused only when delivered. An
            // interrupted follower did not receive the acquisition outcome.
            "axm.work.reused-count": !request.lookupStarted && !Exit.hasInterrupts(exit) ? 1 : 0,
            ...(request.lookupStarted ? {} : { "axm.cache.outcome": "coalesced" }),
          }),
        ),
      );
    }).pipe((effect) =>
      withWork("axm.archive.cache-load", effect, {
        attributes: {
          "axm.work.requested": 1,
          "axm.work.executed": 0,
          "axm.work.reused-count": 0,
        },
      }),
    );

  const status = (): Effect.Effect<ArchiveCacheStatus, RegistryClientFailure> =>
    Effect.map(listEntries(), (entries) => ({
      entries: entries.length,
      bytes: entries.reduce((total, entry) => total + entry.size, 0),
      maxBytes,
      maxAgeDays: Duration.toDays(maxAge),
    }));

  const verify = Effect.fnUntraced(
    function* (): Effect.fn.Return<ArchiveCacheVerifyResult, RegistryClientFailure> {
      const entries = yield* listEntries();
      const results = yield* Effect.forEach(
        entries,
        (entry) =>
          Effect.gen(function* () {
            if (entry.integrity === undefined) {
              yield* removeEntry(entry.path);
              return false;
            }
            const archive = yield* fs
              .readFile(entry.path)
              .pipe(
                Effect.mapError((cause) =>
                  cacheError(`Failed to read cache entry: ${entry.path}`, cause),
                ),
              );
            const actualIntegrity = yield* verifyArchiveIntegrity(archive);
            if (actualIntegrity === entry.integrity) return true;
            yield* removeEntry(entry.path);
            return false;
          }),
        { concurrency: 8 },
      );
      const valid = results.filter(Boolean).length;
      return {
        checked: results.length,
        valid,
        corruptRemoved: results.length - valid,
      } satisfies ArchiveCacheVerifyResult;
    },
    (effect) => withWork("axm.archive.cache-verify", effect),
  );

  return { load, read, write, status, verify, prune: () => prune("explicit") };
});

export const makeUserArchiveCache = Effect.fnUntraced(function* (): Effect.fn.Return<
  ArchiveCache,
  Config.ConfigError,
  FileSystem.FileSystem | Path.Path
> {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = path.join(yield* resolveAxmCacheRoot(), "archives");
  return yield* makeArchiveCache(fs, path, root);
});
