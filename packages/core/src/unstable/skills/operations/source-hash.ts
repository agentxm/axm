import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { computePackageContentHash } from "../../extensions/package-hash.js";
import { computeSourceHash } from "../../extensions/index.js";

// Source hashes are advisory change markers. Reusing the package-content
// algorithm gives every relative path and byte sequence an unambiguous NUL-
// separated representation. Legacy markers remain readable during migration
// and refresh to this representation on the next install or update.
export const computeSkillSourceHash = computePackageContentHash;

/** Computes the pre-package-hash skill marker solely for migration checks. */
export const computeLegacySkillSourceHash = (canonicalPath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const entries = yield* fs
      .readDirectory(canonicalPath, { recursive: true })
      .pipe(Effect.catch(() => Effect.succeed<ReadonlyArray<string>>([])));
    const sorted = [...entries].sort();
    const parts = yield* Effect.forEach(sorted, (entry) => {
      const full = path.join(canonicalPath, entry);
      return fs.stat(full).pipe(
        Effect.flatMap((info) =>
          info.type === "File"
            ? fs.readFileString(full).pipe(Effect.map((content) => `${entry}\n${content}`))
            : Effect.succeed(entry),
        ),
        Effect.catch(() => Effect.succeed(entry)),
      );
    });
    return computeSourceHash(parts.join("\n"));
  });
