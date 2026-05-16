import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import { computeSourceHash } from "../../extensions/index.js";

export const computeSkillSourceHash = (canonicalPath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const entries = yield* fs
      .readDirectory(canonicalPath)
      .pipe(Effect.catch(() => Effect.succeed([])));
    const sorted = [...entries].sort();
    const parts = yield* Effect.forEach(sorted, (entry) =>
      fs.readFileString(path.join(canonicalPath, entry)).pipe(
        Effect.map((content) => `${entry}\n${content}`),
        Effect.catch(() => Effect.succeed(entry)),
      ),
    );
    return computeSourceHash(parts.join("\n"));
  });
