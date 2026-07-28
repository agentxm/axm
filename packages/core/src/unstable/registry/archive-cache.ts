/**
 * Verified, content-addressed cache for registry ZIP archives.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as os from "node:os";
import * as Clock from "effect/Clock";
import * as Config from "effect/Config";
import * as DateTime from "effect/DateTime";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeAppError, type AppError } from "../app-error/index.js";
import { computeIntegrity } from "../utils/index.js";

export const ARCHIVE_CACHE_MAX_BYTES = 2 * 1024 * 1024 * 1024;
export const ARCHIVE_CACHE_MAX_AGE_MILLIS = 90 * 24 * 60 * 60 * 1_000;

export interface ArchiveCacheOptions {
  readonly maxBytes?: number;
  readonly maxAgeMillis?: number;
}

export interface ArchiveCacheStatus {
  readonly entries: number;
  readonly bytes: number;
  readonly maxBytes: number;
  readonly maxAgeDays: number;
}

export interface ArchiveCacheVerifyResult {
  readonly checked: number;
  readonly valid: number;
  readonly corruptRemoved: number;
}

export interface ArchiveCachePruneResult {
  readonly removed: number;
  readonly bytesFreed: number;
  readonly remaining: number;
  readonly remainingBytes: number;
}

export interface ArchiveCache {
  readonly read: (integrity: string) => Effect.Effect<Option.Option<Uint8Array>, AppError>;
  readonly write: (
    integrity: string,
    archive: Uint8Array,
    options?: { readonly prune?: boolean },
  ) => Effect.Effect<void, AppError>;
  readonly status: () => Effect.Effect<ArchiveCacheStatus, AppError>;
  readonly verify: () => Effect.Effect<ArchiveCacheVerifyResult, AppError>;
  readonly prune: () => Effect.Effect<ArchiveCachePruneResult, AppError>;
}

interface CacheEntry {
  readonly path: string;
  readonly integrity: string | undefined;
  readonly size: number;
  readonly accessedAt: number;
}

const cacheError = (detail: string, cause?: unknown): AppError =>
  makeAppError({ code: "internal", detail, ...(cause === undefined ? {} : { cause }) });

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

export interface ArchiveCacheEnvironment {
  readonly axmUserHome?: string;
  readonly localAppData?: string;
  readonly xdgCacheHome?: string;
}

const nonEmpty = (value: string | undefined): string | undefined =>
  value === undefined || value.length === 0 ? undefined : value;

export const resolveArchiveCacheRootPure = (
  pathJoin: (...segments: ReadonlyArray<string>) => string,
  platform: string,
  homeDir: string,
  environment: ArchiveCacheEnvironment,
): string => {
  const overriddenHome = nonEmpty(environment.axmUserHome);
  const home = overriddenHome ?? homeDir;

  if (platform === "darwin") {
    return pathJoin(home, "Library", "Caches", "axm", "archives");
  }

  if (platform === "win32") {
    const cacheHome =
      overriddenHome === undefined
        ? (nonEmpty(environment.localAppData) ?? pathJoin(home, "AppData", "Local"))
        : pathJoin(home, "AppData", "Local");
    return pathJoin(cacheHome, "axm", "cache", "archives");
  }

  const cacheHome =
    overriddenHome === undefined
      ? (nonEmpty(environment.xdgCacheHome) ?? pathJoin(home, ".cache"))
      : pathJoin(home, ".cache");
  return pathJoin(cacheHome, "axm", "archives");
};

const archiveCacheEnvironmentConfig = Config.all({
  axmUserHome: Config.option(Config.string("AXM_USER_HOME")),
  localAppData: Config.option(Config.string("LOCALAPPDATA")),
  xdgCacheHome: Config.option(Config.string("XDG_CACHE_HOME")),
});

export const makeArchiveCache = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  root: string,
  options: ArchiveCacheOptions = {},
): ArchiveCache => {
  const maxBytes = options.maxBytes ?? ARCHIVE_CACHE_MAX_BYTES;
  const maxAgeMillis = options.maxAgeMillis ?? ARCHIVE_CACHE_MAX_AGE_MILLIS;

  const pathForIntegrity = (integrity: string): Effect.Effect<string, AppError> => {
    const fileName = cacheFileName(integrity);
    return fileName === undefined
      ? Effect.fail(cacheError(`Unsupported archive integrity value: ${integrity}`))
      : Effect.succeed(path.join(root, fileName));
  };

  const listEntries = (): Effect.Effect<ReadonlyArray<CacheEntry>, AppError> =>
    Effect.gen(function* () {
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
                onNone: () => 0,
                onSome: (mtime) => mtime.getTime(),
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

  const prune = (): Effect.Effect<ArchiveCachePruneResult, AppError> =>
    Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      const entries = [...(yield* listEntries())].sort((a, b) => a.accessedAt - b.accessedAt);
      const expired = entries.filter((entry) => now - entry.accessedAt > maxAgeMillis);
      yield* Effect.forEach(expired, (entry) => removeEntry(entry.path), { concurrency: 8 });

      const expiredPaths = new Set(expired.map((entry) => entry.path));
      const retained = entries.filter((entry) => !expiredPaths.has(entry.path));
      let retainedBytes = retained.reduce((total, entry) => total + entry.size, 0);
      const removedForSize: Array<CacheEntry> = [];
      for (const entry of retained) {
        if (retainedBytes <= maxBytes) break;
        yield* removeEntry(entry.path);
        removedForSize.push(entry);
        retainedBytes -= entry.size;
      }

      const removed = [...expired, ...removedForSize];
      return {
        removed: removed.length,
        bytesFreed: removed.reduce((total, entry) => total + entry.size, 0),
        remaining: entries.length - removed.length,
        remainingBytes: retainedBytes,
      } satisfies ArchiveCachePruneResult;
    });

  const read = (integrity: string): Effect.Effect<Option.Option<Uint8Array>, AppError> =>
    Effect.gen(function* () {
      const entryPath = yield* pathForIntegrity(integrity);
      const exists = yield* fs.exists(entryPath).pipe(Effect.orElseSucceed(() => false));
      if (!exists) return Option.none();
      const archive = yield* fs
        .readFile(entryPath)
        .pipe(
          Effect.mapError((cause) => cacheError(`Failed to read cache entry: ${entryPath}`, cause)),
        );
      const actualIntegrity = yield* computeIntegrity(archive);
      if (actualIntegrity !== integrity) {
        yield* removeEntry(entryPath);
        return Option.none();
      }
      const now = DateTime.toDateUtc(yield* DateTime.now);
      yield* fs.utimes(entryPath, now, now).pipe(Effect.ignore);
      return Option.some(archive);
    });

  const write = (
    integrity: string,
    archive: Uint8Array,
    writeOptions: { readonly prune?: boolean } = {},
  ): Effect.Effect<void, AppError> =>
    Effect.gen(function* () {
      const actualIntegrity = yield* computeIntegrity(archive);
      if (actualIntegrity !== integrity) {
        return yield* makeAppError({
          code: "validation",
          detail: "Downloaded registry archive did not match its published integrity.",
        });
      }
      const entryPath = yield* pathForIntegrity(integrity);
      yield* fs
        .makeDirectory(root, { recursive: true })
        .pipe(
          Effect.mapError((cause) => cacheError(`Failed to create archive cache: ${root}`, cause)),
        );
      const tempPath = yield* fs
        .makeTempFile({
          directory: root,
          prefix: ".archive-",
          suffix: ".tmp",
        })
        .pipe(
          Effect.mapError((cause) => cacheError("Failed to create archive cache temp file", cause)),
        );
      const tempDirectory = path.dirname(tempPath);
      yield* Effect.ensuring(
        Effect.gen(function* () {
          yield* fs
            .writeFile(tempPath, archive)
            .pipe(
              Effect.mapError((cause) =>
                cacheError("Failed to write archive cache temp file", cause),
              ),
            );
          yield* fs.remove(entryPath).pipe(Effect.ignore);
          yield* fs
            .rename(tempPath, entryPath)
            .pipe(
              Effect.mapError((cause) =>
                cacheError(`Failed to commit cache entry: ${entryPath}`, cause),
              ),
            );
        }),
        fs.remove(tempDirectory, { recursive: true }).pipe(Effect.ignore),
      );
      if (writeOptions.prune !== false) yield* prune();
    });

  const status = (): Effect.Effect<ArchiveCacheStatus, AppError> =>
    Effect.map(listEntries(), (entries) => ({
      entries: entries.length,
      bytes: entries.reduce((total, entry) => total + entry.size, 0),
      maxBytes,
      maxAgeDays: maxAgeMillis / (24 * 60 * 60 * 1_000),
    }));

  const verify = (): Effect.Effect<ArchiveCacheVerifyResult, AppError> =>
    Effect.gen(function* () {
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
            const actualIntegrity = yield* computeIntegrity(archive);
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
    });

  return { read, write, status, verify, prune };
};

export const makeUserArchiveCache = (): Effect.Effect<
  ArchiveCache,
  never,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const environment = yield* Effect.orDie(archiveCacheEnvironmentConfig);
    const axmUserHome = Option.getOrUndefined(environment.axmUserHome);
    const localAppData = Option.getOrUndefined(environment.localAppData);
    const xdgCacheHome = Option.getOrUndefined(environment.xdgCacheHome);
    const cacheEnvironment = {
      ...(axmUserHome === undefined ? {} : { axmUserHome }),
      ...(localAppData === undefined ? {} : { localAppData }),
      ...(xdgCacheHome === undefined ? {} : { xdgCacheHome }),
    } satisfies ArchiveCacheEnvironment;
    const root = resolveArchiveCacheRootPure(
      path.join,
      process.platform,
      os.homedir(),
      cacheEnvironment,
    );
    return makeArchiveCache(fs, path, root);
  });
