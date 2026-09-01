/**
 * Lockfile module for managing project-root `axm-lock.yaml` or the user-scope
 * `axm-lock.yaml` (YAML format).
 *
 * Provides functions to read, write, and update accepted external resolutions.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import { LOCKFILE_NAME } from "@agentxm/extension-model/unstable/workspace-files";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import YAML from "yaml";

import { recordFootprint } from "../workspace/footprint-recorder.js";
import { sweepStaleAtomicWriteTemps, writeFileAtomic } from "../utils/index.js";
import { LockfileValidationError, LockfileWriteError } from "./errors.js";
import { LOCKFILE_VERSION, type Lockfile, LockfileSchema } from "./schema.js";

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

/**
 * Filename for the lockfile.
 *
 * @experimental This API is unstable and may change without notice.
 */

// eslint-disable-next-line no-restricted-syntax -- Process-owned keys are bounded by lockfiles touched during this one CLI invocation.
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

const inProcessSemaphoreFor = (key: string): Semaphore.Semaphore => {
  const existing = lockSemaphores.get(key);
  if (existing !== undefined) return existing;
  const created = Semaphore.makeUnsafe(1);
  lockSemaphores.set(key, created);
  return created;
};

const ensureLockfileParent = (lockfilePath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const parent = path.dirname(lockfilePath);
    yield* fs
      .makeDirectory(parent, { recursive: true })
      .pipe(
        Effect.mapError((cause) => new LockfileWriteError({ path: parent, step: "mkdir", cause })),
      );
  });

const encodeLockfileYaml = (lockfilePath: string, lockfile: Lockfile) =>
  Effect.gen(function* () {
    const encoded = yield* Effect.try({
      try: () => Schema.encodeSync(LockfileSchema)(lockfile),
      catch: (cause) => new LockfileWriteError({ path: lockfilePath, step: "encode", cause }),
    });

    return yield* Effect.try({
      try: () => YAML.stringify(encoded),
      catch: (cause) => new LockfileWriteError({ path: lockfilePath, step: "serialize", cause }),
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
  return Object.keys(patched).length === 0 ? undefined : patched;
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
  const subagents = patchOptionalMap(fresh.subagents, base.subagents, next.subagents);
  const mcpServers = patchOptionalMap(fresh.mcpServers, base.mcpServers, next.mcpServers);
  const rules = patchOptionalMap(fresh.rules, base.rules, next.rules);
  const hooks = patchOptionalMap(fresh.hooks, base.hooks, next.hooks);
  const knowledge = patchOptionalMap(fresh.knowledge, base.knowledge, next.knowledge);
  const packs = patchOptionalMap(fresh.packs, base.packs, next.packs);

  return {
    lockfileVersion: LOCKFILE_VERSION,
    skills: patchRequiredMap(fresh.skills, base.skills, next.skills),
    ...(subagents !== undefined ? { subagents } : {}),
    ...(mcpServers !== undefined ? { mcpServers } : {}),
    ...(rules !== undefined ? { rules } : {}),
    ...(hooks !== undefined ? { hooks } : {}),
    ...(knowledge !== undefined ? { knowledge } : {}),
    ...(packs !== undefined ? { packs } : {}),
  } satisfies Lockfile;
};

const readLockfileIfPresent = (
  lockfilePath: string,
): Effect.Effect<
  Lockfile | undefined,
  LockfileValidationError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const exists = yield* fs
      .exists(lockfilePath)
      .pipe(
        Effect.mapError(
          (cause) => new LockfileValidationError({ path: lockfilePath, step: "check", cause }),
        ),
      );
    if (!exists) return undefined;

    const raw = yield* fs
      .readFileString(lockfilePath)
      .pipe(
        Effect.mapError(
          (cause) => new LockfileValidationError({ path: lockfilePath, step: "read", cause }),
        ),
      );
    const parsed = yield* Effect.try({
      try: (): unknown => YAML.parse(raw),
      catch: (cause) => new LockfileValidationError({ path: lockfilePath, step: "parse", cause }),
    });
    const decoded = yield* Schema.decodeUnknownEffect(LockfileSchema)(parsed, {
      onExcessProperty: "error",
    }).pipe(
      Effect.mapError(
        (cause) => new LockfileValidationError({ path: lockfilePath, step: "decode", cause }),
      ),
    );
    return decoded;
  });

const withLockfileLock = <A, E, R>(
  lockfilePath: string,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R | FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const key = path.resolve(lockfilePath);
    const semaphore = inProcessSemaphoreFor(key);
    // Cross-process exclusion belongs to the workspace transaction. This
    // semaphore only serializes multiple updates in one runtime so the
    // read/patch/write helper cannot race with itself.
    return yield* semaphore.withPermits(1)(effect);
  });

const writeLockfileUnlocked = (lockfilePath: string, lockfile: Lockfile) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const yamlContent = yield* encodeLockfileYaml(lockfilePath, lockfile);
    const existed = yield* fs.exists(lockfilePath).pipe(Effect.orElseSucceed(() => true));
    yield* sweepStaleAtomicWriteTemps(fs, lockfilePath);
    const written = yield* writeFileAtomic(fs, {
      targetPath: lockfilePath,
      content: yamlContent,
      skipIfUnchanged: "fail-on-read-error",
      mapError: (failure) =>
        new LockfileWriteError({
          path: failure.step === "write-temp" ? failure.tempPath : lockfilePath,
          step: failure.step,
          cause: failure.cause,
        }),
    });
    if (written === "written") {
      yield* recordFootprint({ path: lockfilePath, change: existed ? "modified" : "created" });
    }
  });

// -----------------------------------------------------------------------------
// Public Functions
// -----------------------------------------------------------------------------

/**
 * Writes the lockfile to the selected scope's `axm-lock.yaml` in YAML format.
 *
 * Creates the containing directory if it does not exist. Writes are serialized by
 * an in-process keyed semaphore plus a best-effort local advisory lock file.
 * Temporary files are removed by scoped finalizer on interruption, and stale
 * temp files from older crashed writers are swept before each write. When the
 * encoded bytes already match, the existing lockfile is left untouched.
 *
 * `writeLockfile` remains a full replacement operation. Call
 * `commitLockfileUpdates` when applying deltas that must reread the latest
 * lockfile state under the advisory lock.
 *
 * @param axmDir - Directory containing the selected scope's lockfile
 * @param lockfile - The lockfile object to write
 * @returns Effect yielding void on success
 *
 * @experimental This API is unstable and may change without notice.
 */
export const writeLockfileAtPath = (lockfilePath: string, lockfile: Lockfile) =>
  Effect.gen(function* () {
    yield* ensureLockfileParent(lockfilePath);
    yield* withLockfileLock(
      lockfilePath,
      Effect.gen(function* () {
        yield* writeLockfileUnlocked(lockfilePath, lockfile);
      }),
    );
  });

export const writeLockfile = (axmDir: string, lockfile: Lockfile) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    yield* writeLockfileAtPath(lockfilePathFor(path, axmDir), lockfile);
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
 * while reconciling managed package targets.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const commitLockfileUpdates = (
  axmDir: string,
  lockfile: Lockfile,
  updates: ReadonlyArray<LockfileUpdate>,
) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const lockfilePath = lockfilePathFor(path, axmDir);
    yield* ensureLockfileParent(lockfilePath);
    const updated = yield* withLockfileLock(
      lockfilePath,
      Effect.gen(function* () {
        const current = yield* readLockfileIfPresent(lockfilePath);
        const updated = applyLockfileUpdates(current ?? lockfile, updates);
        yield* writeLockfileUnlocked(lockfilePath, updated);
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
export const commitLockfileSnapshotUpdateAtPath = (
  lockfilePath: string,
  base: Lockfile,
  next: Lockfile,
) =>
  Effect.gen(function* () {
    yield* ensureLockfileParent(lockfilePath);
    const updated = yield* withLockfileLock(
      lockfilePath,
      Effect.gen(function* () {
        const current = yield* readLockfileIfPresent(lockfilePath);
        const updated = applyLockfileSnapshotPatch(current ?? base, base, next);
        yield* writeLockfileUnlocked(lockfilePath, updated);
        return updated;
      }),
    );
    return updated;
  });

export const commitLockfileSnapshotUpdate = (axmDir: string, base: Lockfile, next: Lockfile) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    return yield* commitLockfileSnapshotUpdateAtPath(lockfilePathFor(path, axmDir), base, next);
  });
