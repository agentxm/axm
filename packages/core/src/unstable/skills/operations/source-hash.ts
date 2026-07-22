import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import { computeSourceHash } from "../../extensions/index.js";

export const computeSkillSourceHash = (canonicalPath: string) =>
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
        // Recurse into nested directories so changes to nested files change the
        // hash instead of being ignored (misclassified as unchanged).
        Effect.catch(() => Effect.succeed(entry)),
      );
    });
    return computeSourceHash(parts.join("\n"));
  });
