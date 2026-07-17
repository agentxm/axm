import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { makeAppError, type AppError } from "../app-error/index.js";

export const DEFAULT_KNOWLEDGE_DIRECTORY = ".agents/knowledge";

export interface ResolvedKnowledgeProjectionConfig {
  readonly directory: string;
  readonly dir: string;
}

const containsPath = (path: Path.Path, parent: string, child: string): boolean => {
  const relative = path.relative(parent, child);
  return (
    relative === "" ||
    (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))
  );
};

const overlapsPath = (path: Path.Path, left: string, right: string): boolean =>
  containsPath(path, left, right) || containsPath(path, right, left);

const invalidDirectory = (directory: string, reason: string): AppError =>
  makeAppError({
    code: "validation",
    detail: `Invalid knowledgeConfig.directory ${JSON.stringify(directory)}: ${reason}`,
    suggestions: [
      {
        description:
          "Choose a non-empty relative directory inside the active scope that does not overlap .axm",
      },
    ],
  });

const nearestExistingAncestor = (
  candidate: string,
  scopeRoot: string,
): Effect.Effect<string, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    let current = candidate;

    while (!(yield* fs.exists(current))) {
      const parent = path.dirname(current);
      if (parent === current || !containsPath(path, scopeRoot, parent)) return scopeRoot;
      current = parent;
    }

    return current;
  }).pipe(
    Effect.mapError((cause) =>
      makeAppError({
        code: "internal",
        detail: "Failed to inspect the Knowledge projection directory",
        cause,
      }),
    ),
  );

export const resolveKnowledgeProjectionConfig = (args: {
  readonly scopeRoot: string;
  readonly axmDir: string;
  readonly directory?: string;
}): Effect.Effect<ResolvedKnowledgeProjectionConfig, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directory = args.directory ?? DEFAULT_KNOWLEDGE_DIRECTORY;

    if (directory.trim().length === 0) return yield* invalidDirectory(directory, "it is empty");
    if (path.isAbsolute(directory)) return yield* invalidDirectory(directory, "it is absolute");

    const scopeRoot = path.resolve(args.scopeRoot);
    const axmDir = path.resolve(args.axmDir);
    const dir = path.resolve(scopeRoot, directory);

    if (dir === scopeRoot) {
      return yield* invalidDirectory(directory, "it resolves to the active scope root");
    }
    if (!containsPath(path, scopeRoot, dir)) {
      return yield* invalidDirectory(directory, "it resolves outside the active scope root");
    }
    if (overlapsPath(path, dir, axmDir)) {
      return yield* invalidDirectory(directory, "it overlaps AXM's .axm state directory");
    }

    const existingAncestor = yield* nearestExistingAncestor(dir, scopeRoot);
    const realScopeRoot = yield* fs.realPath(scopeRoot).pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "internal",
          detail: "Failed to resolve the active scope root while validating Knowledge settings",
          cause,
        }),
      ),
    );
    const realAncestor = yield* fs.realPath(existingAncestor).pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "internal",
          detail: "Failed to resolve the Knowledge projection directory",
          cause,
        }),
      ),
    );
    const realDir = path.resolve(realAncestor, path.relative(existingAncestor, dir));

    if (!containsPath(path, realScopeRoot, realDir)) {
      return yield* invalidDirectory(directory, "it resolves outside the active scope root");
    }

    const normalizedDirectory = path.normalize(path.relative(scopeRoot, dir));
    return { directory: normalizedDirectory, dir };
  });
