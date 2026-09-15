import type { PlatformError } from "effect/PlatformError";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

/**
 * Resolves the parent directory of a path through symlinks while
 * preserving the final path component (basename).
 *
 * Needed for computing correct relative symlink paths when parent
 * directories may themselves be symlinks. Missing parent directories are
 * preserved below the nearest existing ancestor, whose real path is used as
 * the common base. This also handles platform aliases such as macOS `/tmp` →
 * `/private/tmp` before the link parent has been created.
 */
export const resolveParentSymlinks = (
  filePath: string,
): Effect.Effect<string, PlatformError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const p = yield* Path.Path;
    const basename = p.basename(filePath);
    const missingParents: Array<string> = [];
    let current = p.dirname(filePath);

    while (true) {
      const resolved = yield* fs.realPath(current).pipe(Effect.option);
      if (Option.isSome(resolved)) {
        return p.join(resolved.value, ...missingParents, basename);
      }

      const parent = p.dirname(current);
      if (parent === current) {
        return yield* fs
          .realPath(current)
          .pipe(Effect.map((resolvedRoot) => p.join(resolvedRoot, ...missingParents, basename)));
      }
      missingParents.unshift(p.basename(current));
      current = parent;
    }
  });
