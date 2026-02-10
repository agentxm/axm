/**
 * Lockfile service for centralized lockfile I/O.
 *
 * Provides query and mutation methods backed by a Semaphore(1) to serialize
 * mutations. Auto-creates `axm-lock.yaml` with `{ lockfileVersion: 1, skills: {} }`
 * on first access if the file does not exist.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import type { LockfileError } from "./lockfile.js";
import { readLockfile, writeLockfile } from "./lockfile.js";
import type { SkillLockEntry, SkillsLockMap } from "./schema.js";
import { Workspace } from "../workspace/service.js";

// -----------------------------------------------------------------------------
// Service Interface
// -----------------------------------------------------------------------------

/**
 * Lockfile service interface.
 *
 * Provides 2 query methods (no semaphore) and 2 mutation methods (serialized
 * by a Semaphore(1) to prevent interleaving of read-modify-write cycles).
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface LockfileServiceInterface {
  /** Read lockfile and return the skills lock map. */
  readonly getSkills: () => Effect.Effect<SkillsLockMap, LockfileError>;
  /** Read lockfile and return the entry for a specific skill, or Option.none(). */
  readonly getEntry: (
    skillName: string,
  ) => Effect.Effect<Option.Option<SkillLockEntry>, LockfileError>;
  /** Add or update a skill entry and write to disk. Sets updatedAt. Serialized by semaphore. */
  readonly updateEntry: (
    skillName: string,
    entry: SkillLockEntry,
  ) => Effect.Effect<void, LockfileError>;
  /** Remove a skill entry and write to disk. No-op if absent. Serialized by semaphore. */
  readonly removeEntry: (skillName: string) => Effect.Effect<void, LockfileError>;
}

// -----------------------------------------------------------------------------
// Service Tag
// -----------------------------------------------------------------------------

/**
 * Effect service tag for lockfile.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class LockfileService extends Context.Tag("@axm.sh/cli/LockfileService")<
  LockfileService,
  LockfileServiceInterface
>() {}

// -----------------------------------------------------------------------------
// Live Layer
// -----------------------------------------------------------------------------

/**
 * Live layer for {@link LockfileService}.
 *
 * Depends on {@link Workspace} for the `.axm` directory path and
 * `FileSystem`/`Path` for disk I/O. Constructs a Semaphore(1) to serialize
 * mutation methods.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const LockfileServiceLive: Layer.Layer<
  LockfileService,
  never,
  Workspace | FileSystem.FileSystem | Path.Path
> = Layer.effect(
  LockfileService,
  Effect.gen(function* () {
    const ws = yield* Workspace;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const semaphore = yield* Effect.makeSemaphore(1);

    const axmDir = ws.path;
    const fsLayer = Layer.merge(
      Layer.succeed(FileSystem.FileSystem, fs),
      Layer.succeed(Path.Path, path),
    );

    // -------------------------------------------------------------------------
    // Internal helper: read lockfile (returns empty if not found)
    // -------------------------------------------------------------------------

    const read = () => readLockfile(axmDir).pipe(Effect.provide(fsLayer));

    // -------------------------------------------------------------------------
    // Mutation wrapper
    // -------------------------------------------------------------------------

    const withMutex = semaphore.withPermits(1);

    // -------------------------------------------------------------------------
    // Service implementation
    // -------------------------------------------------------------------------

    return {
      getSkills: () => read().pipe(Effect.map((lf) => lf.skills)),

      getEntry: (skillName) =>
        read().pipe(Effect.map((lf) => Option.fromNullable(lf.skills[skillName]))),

      updateEntry: (skillName, entry) =>
        withMutex(
          Effect.gen(function* () {
            const current = yield* read();
            const updated = {
              ...current,
              skills: {
                ...current.skills,
                [skillName]: {
                  ...entry,
                  updatedAt: new Date(),
                },
              },
            };
            yield* writeLockfile(axmDir, updated).pipe(Effect.provide(fsLayer));
          }),
        ),

      removeEntry: (skillName) =>
        withMutex(
          Effect.gen(function* () {
            const current = yield* read();
            if (!(skillName in current.skills)) return;
            const { [skillName]: _, ...remainingSkills } = current.skills;
            void _;
            const updated = {
              ...current,
              skills: remainingSkills,
            };
            yield* writeLockfile(axmDir, updated).pipe(Effect.provide(fsLayer));
          }),
        ),
    };
  }),
);
