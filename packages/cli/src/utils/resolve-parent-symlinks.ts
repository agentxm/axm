import type { PlatformError } from "@effect/platform/Error";
import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as Effect from "effect/Effect";

/**
 * Resolves the parent directory of a path through symlinks while
 * preserving the final path component (basename).
 *
 * Needed for computing correct relative symlink paths when parent
 * directories may themselves be symlinks.
 */
export const resolveParentSymlinks = (
  filePath: string,
): Effect.Effect<string, PlatformError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const p = yield* Path.Path;
    const parent = p.dirname(filePath);
    const basename = p.basename(filePath);
    const resolvedParent = yield* fs.realPath(parent);
    return p.join(resolvedParent, basename);
  });
