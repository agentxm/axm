import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { makeAbsolutePath, type AbsolutePath } from "@agentxm/extension-model/unstable/path-types";

/**
 * Validates that a resolved target path stays within a base directory.
 * Uses path separator boundary check to prevent prefix false positives.
 */
export const isPathSafe = (path: Path.Path, base: string, target: string): boolean => {
  const resolvedBase = path.resolve(base);
  const resolvedTarget = path.resolve(target);
  return resolvedTarget === resolvedBase || resolvedTarget.startsWith(resolvedBase + path.sep);
};

/**
 * Resolve `target` and return it only when it stays inside `base`.
 */
export const safeChildPath = (
  base: AbsolutePath,
  target: string,
): Effect.Effect<Option.Option<AbsolutePath>, never, Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const resolvedBase = path.resolve(base);
    const resolvedTarget = path.isAbsolute(target)
      ? path.resolve(target)
      : path.resolve(resolvedBase, target);
    const safe =
      resolvedTarget === resolvedBase || resolvedTarget.startsWith(resolvedBase + path.sep);
    return safe ? Option.some(makeAbsolutePath(path, resolvedTarget)) : Option.none();
  });

/** A resolved path escaped its workspace base directory. */
export class PathTraversalDetected extends Data.TaggedError("PathTraversalDetected")<{
  readonly path: string;
}> {}

/** Fail with `PathTraversalDetected` when `targetPath` escapes `baseDir`. */
export const validatePathSafety = (
  path: Path.Path,
  baseDir: string,
  targetPath: string,
): Effect.Effect<void, PathTraversalDetected> =>
  isPathSafe(path, baseDir, targetPath)
    ? Effect.void
    : new PathTraversalDetected({ path: targetPath });
