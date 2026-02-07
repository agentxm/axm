import * as nodePath from "node:path";
import type { PlatformError } from "@effect/platform/Error";
import * as FileSystem from "@effect/platform/FileSystem";
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
): Effect.Effect<string, PlatformError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const parent = nodePath.dirname(filePath);
    const basename = nodePath.basename(filePath);
    const resolvedParent = yield* fs.realPath(parent);
    return nodePath.join(resolvedParent, basename);
  });
