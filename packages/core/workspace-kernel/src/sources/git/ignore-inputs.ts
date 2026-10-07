import * as crypto from "node:crypto";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import type { SelectionRule } from "../../acquisition/index.js";

export class IgnoreDiscoveryFailed extends Data.TaggedError("IgnoreDiscoveryFailed")<{
  readonly detail: string;
  readonly cause?: unknown;
}> {}

export interface IgnoreSnapshot {
  readonly boundaryRoot: string;
  readonly packageDirectory: string;
  readonly rules: ReadonlyArray<SelectionRule>;
  readonly fingerprint: string;
}

/** Rediscover every time, including missing ancestor files and newly created nested files. */
export const observeGitIgnoreInputs = (input: {
  readonly packageRoot: string;
  /** Acquisition callers supply the original source boundary. */
  readonly boundaryRoot?: string;
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const readLink = (absolute: string) =>
      fs.readLink(absolute).pipe(
        Effect.catchIf(
          (error) => {
            const cause = error.reason.cause;
            return (
              typeof cause === "object" &&
              cause !== null &&
              "code" in cause &&
              cause.code === "EINVAL"
            );
          },
          () => Effect.succeed(undefined),
        ),
      );
    const packageRoot = path.resolve(input.packageRoot);
    let boundaryRoot =
      input.boundaryRoot === undefined ? packageRoot : path.resolve(input.boundaryRoot);
    if (input.boundaryRoot === undefined) {
      let current = packageRoot;
      while (true) {
        if (yield* fs.exists(path.join(current, ".git"))) {
          boundaryRoot = current;
          break;
        }
        const parent = path.dirname(current);
        if (parent === current) break;
        current = parent;
      }
    }
    const packageDirectory = path.relative(boundaryRoot, packageRoot).split(path.sep).join("/");
    if (
      packageDirectory === ".." ||
      packageDirectory.startsWith("../") ||
      path.isAbsolute(packageDirectory)
    ) {
      return yield* new IgnoreDiscoveryFailed({
        detail: "The package is outside its ignore discovery boundary.",
      });
    }
    const directories: Array<string> = [];
    let ancestor = packageRoot;
    while (true) {
      directories.unshift(ancestor);
      if (ancestor === boundaryRoot) break;
      ancestor = path.dirname(ancestor);
    }
    const pending = [packageRoot];
    while (pending.length > 0) {
      const directory = pending.pop();
      if (directory === undefined) break;
      for (const name of (yield* fs.readDirectory(directory)).sort().reverse()) {
        if (name === ".git") continue;
        const absolute = path.join(directory, name);
        if ((yield* readLink(absolute)) !== undefined) continue;
        const info = yield* fs.stat(absolute);
        if (info.type !== "Directory") continue;
        directories.push(absolute);
        pending.push(absolute);
      }
    }
    directories.sort((left, right) => {
      const depth = (value: string) => path.relative(boundaryRoot, value).split(path.sep).length;
      return depth(left) - depth(right) || left.localeCompare(right);
    });
    const rules: Array<SelectionRule> = [];
    const observed: Array<{ readonly file: string; readonly contents: string }> = [];
    for (const directory of directories) {
      const absolute = path.join(directory, ".gitignore");
      const link = yield* readLink(absolute).pipe(
        Effect.catchIf(
          (error) => error.reason._tag === "NotFound",
          () => Effect.succeed(undefined),
        ),
      );
      if (link !== undefined) {
        return yield* new IgnoreDiscoveryFailed({
          detail: "A publication .gitignore must be a regular file, not a symbolic link.",
        });
      }
      const info = yield* fs.stat(absolute).pipe(
        Effect.catchIf(
          (error) => error.reason._tag === "NotFound",
          () => Effect.succeed(undefined),
        ),
      );
      if (info === undefined) continue;
      // Git does not follow symbolic links when accessing a .gitignore file.
      if (info.type !== "File") {
        return yield* new IgnoreDiscoveryFailed({
          detail: "A publication .gitignore must be a regular file.",
        });
      }
      const contents = yield* fs.readFileString(absolute);
      const file = path.relative(boundaryRoot, absolute).split(path.sep).join("/");
      const baseDirectory = path.relative(boundaryRoot, directory).split(path.sep).join("/");
      observed.push({ file, contents });
      contents.split(/\r?\n/).forEach((pattern, index) => {
        if (pattern === "" || pattern.startsWith("#")) return;
        rules.push({
          pattern,
          baseDirectory,
          origin: { kind: "gitignore", file, line: index + 1 },
        });
      });
    }
    return {
      boundaryRoot,
      packageDirectory,
      rules,
      fingerprint: crypto
        .createHash("sha256")
        .update(JSON.stringify({ packageDirectory, observed }))
        .digest("hex"),
    } satisfies IgnoreSnapshot;
  }).pipe(
    Effect.mapError((cause) =>
      cause instanceof IgnoreDiscoveryFailed
        ? cause
        : new IgnoreDiscoveryFailed({
            detail: "Cannot read publication ignore inputs.",
            cause,
          }),
    ),
  );
