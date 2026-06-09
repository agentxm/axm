import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

const entryExists = (filePath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* fs.exists(filePath).pipe(Effect.catch(() => Effect.succeed(false)));
  });

export const findGitRoot = (workspaceRoot: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;

    const walk = (
      current: string,
    ): Effect.Effect<Option.Option<string>, never, FileSystem.FileSystem | Path.Path> =>
      Effect.gen(function* () {
        const hasGitEntry = yield* entryExists(path.join(current, ".git"));
        if (hasGitEntry) return Option.some(current);

        const parent = path.dirname(current);
        if (parent === current) return Option.none<string>();

        return yield* walk(parent);
      });

    return yield* walk(path.resolve(workspaceRoot));
  });

export const isGitManaged = (workspaceRoot: string) =>
  findGitRoot(workspaceRoot).pipe(Effect.map(Option.isSome));
