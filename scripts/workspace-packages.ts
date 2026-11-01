/** Workspace package directories, enumerated from the pnpm workspace globs. */
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import type * as PlatformError from "effect/PlatformError";
import * as Schema from "effect/Schema";
import { parse } from "yaml";
import { releaseValidation, ReleaseValidationFailed } from "./release-process.js";

const workspaceDeclaration = Schema.Struct({ packages: Schema.NonEmptyArray(Schema.String) });

/** Literal segments and a single-directory `*` retain pnpm's declared traversal here. */
const expandPattern = Effect.fnUntraced(function* (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  base: string,
  segments: readonly string[],
): Effect.fn.Return<readonly string[], PlatformError.PlatformError | ReleaseValidationFailed> {
  const [head, ...rest] = segments;
  if (head === undefined) return [base];
  if (head === "*") {
    const entries = yield* fs.readDirectoryEntries(base).pipe(
      Effect.catchIf(
        (error) => error.reason._tag === "NotFound",
        () => Effect.succeed([]),
      ),
    );
    const nested = yield* Effect.forEach(
      entries.filter(
        (entry) =>
          entry.type === "Directory" &&
          entry.name !== "node_modules" &&
          !entry.name.startsWith("."),
      ),
      (entry) => expandPattern(fs, path, path.join(base, entry.name), rest),
    );
    return nested.flat();
  }
  if (head.includes("*"))
    return yield* new ReleaseValidationFailed({
      operation: "Expand workspace packages",
      cause: `Unsupported pnpm workspace glob segment: ${head}`,
    });
  return yield* expandPattern(fs, path, path.join(base, head), rest);
});

/** Repository-relative package directories in declared-pattern and then lexical order. */
export const readWorkspacePackageDirectories = Effect.fnUntraced(function* (repoRoot: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const source = yield* fs.readFileString(path.join(repoRoot, "pnpm-workspace.yaml"));
  const parsed = yield* releaseValidation("Decode pnpm workspace", (): unknown => parse(source));
  const { packages: patterns } = yield* Schema.decodeUnknownEffect(workspaceDeclaration)(parsed);
  const directories = (yield* Effect.forEach(patterns, (pattern) =>
    expandPattern(fs, path, repoRoot, pattern.split("/")),
  )).flat();
  const packages = yield* Effect.filter(directories, (directory) =>
    fs.stat(path.join(directory, "package.json")).pipe(
      Effect.as(true),
      Effect.catchIf(
        (error) => error.reason._tag === "NotFound",
        () => Effect.succeed(false),
      ),
    ),
  );
  return packages
    .map((directory) => path.relative(repoRoot, directory).split(path.sep).join("/"))
    .sort();
});
