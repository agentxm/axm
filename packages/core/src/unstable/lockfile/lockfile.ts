/**
 * Lockfile module for managing `.axm/axm-lock.yaml` (YAML format).
 *
 * Provides functions to read, write, and update lockfile entries
 * for tracking installed skill versions.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import type { PlatformError } from "effect/PlatformError";
import YAML from "yaml";

import { makeAppError, type AppError } from "../app-error/index.js";
import { type Lockfile, LockfileSchema } from "./schema.js";

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

/**
 * Filename for the lockfile.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const LOCKFILE_NAME = "axm-lock.yaml";

const LOCKFILE_LOCK_NAME = `${LOCKFILE_NAME}.lock`;
const TEMP_PREFIX = `${LOCKFILE_NAME}.tmp.`;
const STALE_LOCK_TIMEOUT_MILLIS = 30_000;
const LOCK_RETRY_DELAY = "25 millis";

const lockSemaphores = new Map<string, Semaphore.Semaphore>();

/**
 * Pure lockfile transformation used to batch multiple lockfile updates before
 * one atomic write.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type LockfileUpdate = (lockfile: Lockfile) => Lockfile;

// -----------------------------------------------------------------------------
// Internal Helpers
// -----------------------------------------------------------------------------

const lockfilePathFor = (path: Path.Path, axmDir: string): string =>
  path.join(axmDir, LOCKFILE_NAME);

const lockfileLockPathFor = (path: Path.Path, axmDir: string): string =>
  path.join(axmDir, LOCKFILE_LOCK_NAME);

const makeTempPath = (path: Path.Path, axmDir: string): string =>
  path.join(
    axmDir,
    `${TEMP_PREFIX}${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 8)}`,
  );

const inProcessSemaphoreFor = (key: string): Semaphore.Semaphore => {
  const existing = lockSemaphores.get(key);
  if (existing !== undefined) return existing;
  const created = Semaphore.makeUnsafe(1);
  lockSemaphores.set(key, created);
  return created;
};

const ensureAxmDir = (axmDir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* fs.makeDirectory(axmDir, { recursive: true }).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Failed to create directory ${axmDir}`,
          cause: error,
        }),
      ),
    );
  });

const removeFileBestEffort = (filePath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* fs.remove(filePath, { force: true }).pipe(Effect.ignore);
  });

const sweepStaleLockfileTemps = (axmDir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const entries = yield* fs.readDirectory(axmDir).pipe(Effect.orElseSucceed(() => []));
    yield* Effect.forEach(
      entries.filter((entry) => entry.startsWith(TEMP_PREFIX)),
      (entry) => fs.remove(path.join(axmDir, entry), { force: true }).pipe(Effect.ignore),
      { concurrency: "unbounded", discard: true },
    );
  });

const encodeLockfileYaml = (lockfile: Lockfile) =>
  Effect.gen(function* () {
    const encoded = yield* Effect.try({
      try: () => Schema.encodeSync(LockfileSchema)(lockfile),
      catch: (error) =>
        makeAppError({
          code: "internal",
          detail: "Failed to encode lockfile",
          cause: error,
        }),
    });

    return yield* Effect.try({
      try: () => YAML.stringify(encoded),
      catch: (error) =>
        makeAppError({
          code: "internal",
          detail: "Failed to serialize lockfile to YAML",
          cause: error,
        }),
    });
  });

const patchOptionalMap = <T>(
  fresh: Readonly<Record<string, T>> | undefined,
  base: Readonly<Record<string, T>> | undefined,
  next: Readonly<Record<string, T>> | undefined,
): Record<string, T> | undefined => {
  if (base === undefined && next === undefined)
    return fresh === undefined ? undefined : { ...fresh };

  const patched: Record<string, T> = { ...(fresh ?? {}) };
  for (const key of Object.keys(base ?? {})) {
    if (!Object.hasOwn(next ?? {}, key)) {
      delete patched[key];
    }
  }
  for (const [key, value] of Object.entries(next ?? {})) {
    patched[key] = value;
  }
  return Object.keys(patched).length === 0 && next === undefined ? undefined : patched;
};

const patchRequiredMap = <T>(
  fresh: Readonly<Record<string, T>>,
  base: Readonly<Record<string, T>>,
  next: Readonly<Record<string, T>>,
): Record<string, T> => {
  const patched: Record<string, T> = { ...fresh };
  for (const key of Object.keys(base)) {
    if (!Object.hasOwn(next, key)) {
      delete patched[key];
    }
  }
  for (const [key, value] of Object.entries(next)) {
    patched[key] = value;
  }
  return patched;
};

const applyLockfileSnapshotPatch = (fresh: Lockfile, base: Lockfile, next: Lockfile): Lockfile => {
  const commands = patchOptionalMap(fresh.commands, base.commands, next.commands);
  const subagents = patchOptionalMap(fresh.subagents, base.subagents, next.subagents);
  const mcpServers = patchOptionalMap(fresh.mcpServers, base.mcpServers, next.mcpServers);
  const files = patchOptionalMap(fresh.files, base.files, next.files);
  const rules = patchOptionalMap(fresh.rules, base.rules, next.rules);
  const hooks = patchOptionalMap(fresh.hooks, base.hooks, next.hooks);
  const packs = patchOptionalMap(fresh.packs, base.packs, next.packs);
  const libraries = patchOptionalMap(fresh.libraries, base.libraries, next.libraries);

  return {
    lockfileVersion: next.lockfileVersion,
    skills: patchRequiredMap(fresh.skills, base.skills, next.skills),
    ...(commands !== undefined ? { commands } : {}),
    ...(subagents !== undefined ? { subagents } : {}),
    ...(mcpServers !== undefined ? { mcpServers } : {}),
    ...(files !== undefined ? { files } : {}),
    ...(rules !== undefined ? { rules } : {}),
    ...(hooks !== undefined ? { hooks } : {}),
    ...(packs !== undefined ? { packs } : {}),
    ...(libraries !== undefined ? { libraries } : {}),
  } satisfies Lockfile;
};

const readLockfileIfPresent = (
  axmDir: string,
): Effect.Effect<Lockfile | undefined, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const lockfilePath = lockfilePathFor(path, axmDir);
    const exists = yield* fs.exists(lockfilePath).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Failed to check lockfile at ${lockfilePath}`,
          cause: error,
        }),
      ),
    );
    if (!exists) return undefined;

    const raw = yield* fs.readFileString(lockfilePath).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Failed to read lockfile at ${lockfilePath}`,
          cause: error,
        }),
      ),
    );
    const parsed = yield* Effect.try({
      try: (): unknown => YAML.parse(raw),
      catch: (error) =>
        makeAppError({
          code: "validation",
          detail: `Failed to parse lockfile at ${lockfilePath}`,
          cause: error,
        }),
    });
    return yield* Schema.decodeUnknownEffect(LockfileSchema)(parsed).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "validation",
          detail: `Failed to decode lockfile at ${lockfilePath}`,
          cause: error,
        }),
      ),
    );
  });

const lockIsStale = (lockPath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const info = yield* fs.stat(lockPath).pipe(Effect.option);
    if (info._tag === "None" || info.value.mtime._tag === "None") return false;
    return Date.now() - info.value.mtime.value.getTime() > STALE_LOCK_TIMEOUT_MILLIS;
  });

const createLockFile = (lockPath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const content = `pid=${typeof process === "object" ? process.pid : "unknown"}\ncreatedAt=${new Date().toISOString()}\n`;
    yield* fs.writeFileString(lockPath, content, { flag: "wx" });
  });

const acquireFileLock = (
  lockPath: string,
): Effect.Effect<void, PlatformError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const result = yield* createLockFile(lockPath).pipe(Effect.result);
    if (result._tag === "Success") return;
    if (result.failure.reason._tag !== "AlreadyExists") {
      return yield* result.failure;
    }

    const stale = yield* lockIsStale(lockPath);
    if (stale) {
      yield* removeFileBestEffort(lockPath);
      return yield* acquireFileLock(lockPath);
    }

    yield* Effect.sleep(LOCK_RETRY_DELAY);
    return yield* acquireFileLock(lockPath);
  });

const withLockfileLock = <A, E, R>(
  axmDir: string,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E | AppError, R | FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const key = path.resolve(axmDir);
    const lockPath = lockfileLockPathFor(path, axmDir);
    const semaphore = inProcessSemaphoreFor(key);

    return yield* semaphore.withPermits(1)(
      Effect.scoped(
        Effect.gen(function* () {
          yield* Effect.acquireRelease(
            acquireFileLock(lockPath).pipe(
              Effect.mapError((error) =>
                makeAppError({
                  code: "internal",
                  detail: `Failed to acquire lockfile lock at ${lockPath}`,
                  cause: error,
                }),
              ),
            ),
            () => removeFileBestEffort(lockPath),
          );
          return yield* effect;
        }),
      ),
    );
  });

const writeLockfileUnlocked = (axmDir: string, lockfile: Lockfile) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const lockfilePath = lockfilePathFor(path, axmDir);
    const tempPath = makeTempPath(path, axmDir);

    const yamlContent = yield* encodeLockfileYaml(lockfile);
    const exists = yield* fs.exists(lockfilePath).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Failed to check lockfile at ${lockfilePath}`,
          cause: error,
        }),
      ),
    );
    if (exists) {
      const currentContent = yield* fs.readFileString(lockfilePath).pipe(
        Effect.mapError((error) =>
          makeAppError({
            code: "internal",
            detail: `Failed to read lockfile at ${lockfilePath}`,
            cause: error,
          }),
        ),
      );
      if (currentContent === yamlContent) return;
    }

    yield* Effect.scoped(
      Effect.gen(function* () {
        yield* Effect.acquireRelease(
          fs.writeFileString(tempPath, yamlContent).pipe(
            Effect.mapError((error) =>
              makeAppError({
                code: "internal",
                detail: `Failed to write lockfile temp file at ${tempPath}`,
                cause: error,
              }),
            ),
          ),
          () => removeFileBestEffort(tempPath),
        );

        yield* fs.rename(tempPath, lockfilePath).pipe(
          Effect.mapError((error) =>
            makeAppError({
              code: "internal",
              detail: `Failed to atomically replace lockfile at ${lockfilePath}`,
              cause: error,
            }),
          ),
        );
      }),
    );
  });

// -----------------------------------------------------------------------------
// Public Functions
// -----------------------------------------------------------------------------

/**
 * Writes the lockfile to `.axm/axm-lock.yaml` in YAML format.
 *
 * Creates the `.axm` directory if it does not exist. Writes are serialized by
 * an in-process keyed semaphore plus a best-effort local advisory lock file.
 * Temporary files are removed by scoped finalizer on interruption, and stale
 * temp files from older crashed writers are swept before each write. When the
 * encoded bytes already match, the existing lockfile is left untouched.
 *
 * `writeLockfile` remains a full replacement operation. Call
 * `commitLockfileUpdates` when applying deltas that must reread the latest
 * lockfile state under the advisory lock.
 *
 * Encodes Date fields to ISO strings for YAML serialization.
 *
 * @param axmDir - Path to the `.axm` directory
 * @param lockfile - The lockfile object to write
 * @returns Effect yielding void on success
 *
 * @experimental This API is unstable and may change without notice.
 */
export const writeLockfile = (axmDir: string, lockfile: Lockfile) =>
  Effect.gen(function* () {
    yield* ensureAxmDir(axmDir);
    yield* withLockfileLock(
      axmDir,
      Effect.gen(function* () {
        yield* sweepStaleLockfileTemps(axmDir);
        yield* writeLockfileUnlocked(axmDir, lockfile);
      }),
    );
  });

/**
 * Applies lockfile updates in order without writing to disk.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const applyLockfileUpdates = (
  lockfile: Lockfile,
  updates: ReadonlyArray<LockfileUpdate>,
): Lockfile => updates.reduce((current, update) => update(current), lockfile);

/**
 * Applies a batch of lockfile updates and writes the result once.
 *
 * This is intended for sync flows that discover multiple render-hash changes
 * while reconciling Context Files package targets.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const commitLockfileUpdates = (
  axmDir: string,
  lockfile: Lockfile,
  updates: ReadonlyArray<LockfileUpdate>,
) =>
  Effect.gen(function* () {
    yield* ensureAxmDir(axmDir);
    const updated = yield* withLockfileLock(
      axmDir,
      Effect.gen(function* () {
        yield* sweepStaleLockfileTemps(axmDir);
        const current = yield* readLockfileIfPresent(axmDir);
        const updated = applyLockfileUpdates(current ?? lockfile, updates);
        yield* writeLockfileUnlocked(axmDir, updated);
        return updated;
      }),
    );
    return updated;
  });

/**
 * Commits a caller-computed lockfile snapshot as an entry-level patch.
 *
 * The caller supplies the base snapshot it read and the next snapshot it
 * computed. The helper rereads the current on-disk lockfile under the advisory
 * lock, applies only the base→next entry changes, then writes once. This keeps
 * independent concurrent updates from dropping each other while preserving
 * explicit entry deletions.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const commitLockfileSnapshotUpdate = (axmDir: string, base: Lockfile, next: Lockfile) =>
  Effect.gen(function* () {
    yield* ensureAxmDir(axmDir);
    const updated = yield* withLockfileLock(
      axmDir,
      Effect.gen(function* () {
        yield* sweepStaleLockfileTemps(axmDir);
        const current = yield* readLockfileIfPresent(axmDir);
        const updated = applyLockfileSnapshotPatch(current ?? base, base, next);
        yield* writeLockfileUnlocked(axmDir, updated);
        return updated;
      }),
    );
    return updated;
  });
