/** Git checkout boundaries: the nearest ancestor holding a `.git` entry. */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import type { PlatformError } from "effect/PlatformError";

/** Options for `findGitRoot`. */
export interface FindGitRootOptions {
  /** Whether the walk may step up to `parent`. A refused parent ends the walk without a root. */
  readonly continueTo?: (parent: string) => boolean;
}

const walkToGitRoot = <E>(
  start: string,
  hasGitEntry: (directory: string) => Effect.Effect<boolean, E>,
  continueTo: (parent: string) => boolean,
): Effect.Effect<Option.Option<string>, E, Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    let current = path.resolve(start);
    while (!(yield* hasGitEntry(current))) {
      const parent = path.dirname(current);
      if (parent === current || !continueTo(parent)) return Option.none<string>();
      current = parent;
    }
    return Option.some(current);
  });

/**
 * The nearest directory at or above `start` holding a `.git` entry, which a
 * worktree or submodule writes as a file. A failure to inspect an ancestor
 * stays typed, so each caller decides what an unreadable boundary means.
 */
export const findGitRoot = (
  start: string,
  options: FindGitRootOptions = {},
): Effect.Effect<Option.Option<string>, PlatformError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    return yield* walkToGitRoot(
      start,
      (directory) => fs.exists(path.join(directory, ".git")),
      options.continueTo ?? (() => true),
    );
  });

/**
 * Detection for callers that only ask whether a checkout encloses `start`: an
 * ancestor that cannot be inspected counts as holding no `.git` entry, and
 * the walk continues above it.
 */
export const detectGitRoot = (
  start: string,
): Effect.Effect<Option.Option<string>, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    return yield* walkToGitRoot(
      start,
      (directory) =>
        fs.exists(path.join(directory, ".git")).pipe(Effect.orElseSucceed(() => false)),
      () => true,
    );
  });

/** Whether a Git checkout encloses `start`, by the rule of `detectGitRoot`. */
export const isGitManaged = (
  start: string,
): Effect.Effect<boolean, never, FileSystem.FileSystem | Path.Path> =>
  Effect.map(detectGitRoot(start), Option.isSome);
