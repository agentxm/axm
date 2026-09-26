import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import type * as Path from "effect/Path";
import { isPathSafe } from "@agentxm/extension-model/unstable/path-types";

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
