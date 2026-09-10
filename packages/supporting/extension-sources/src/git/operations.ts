/**
 * Git operations for cloning repositories at specific refs.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { simpleGit, type SimpleGit, type SimpleGitOptions } from "simple-git";

import { GitOperationFailed, type GitOperation } from "../errors.js";

// -----------------------------------------------------------------------------
// Internal Helpers
// -----------------------------------------------------------------------------

const createGit = (baseDir: string, abort?: AbortSignal): SimpleGit => {
  const options: Partial<SimpleGitOptions> = {
    baseDir,
    binary: "git",
    maxConcurrentProcesses: 1,
    ...(abort === undefined ? {} : { abort }),
  };

  return simpleGit(options).env("GIT_TERMINAL_PROMPT", "0").env("GIT_LFS_SKIP_SMUDGE", "1");
};

/**
 * Maps unknown errors to the typed git failure with appropriate context.
 */
const mapGitError =
  (operation: GitOperation, context?: string) =>
  (error: unknown): GitOperationFailed => {
    const baseMessage = context ?? `Git ${operation} failed`;

    return new GitOperationFailed({
      operation,
      detail: baseMessage,
      cause: error,
    });
  };

const toPosixPath = (value: string, separator: string): string =>
  separator === "/" ? value : value.split(separator).join("/");

const relativeTreePath = (
  repositoryDirectory: string,
  repositoryPath: string,
): string | undefined => {
  if (repositoryDirectory === ".") return repositoryPath;
  const prefix = `${repositoryDirectory}/`;
  return repositoryPath.startsWith(prefix) ? repositoryPath.slice(prefix.length) : undefined;
};

const parseHeadBlobs = (
  output: string,
  repositoryDirectory: string,
): ReadonlyMap<string, string> => {
  const blobs = new Map<string, string>();
  for (const record of output.split("\0")) {
    if (record.length === 0) continue;
    const separator = record.indexOf("\t");
    if (separator < 0) throw new Error(`Unexpected ls-tree output: ${record}`);
    const [mode, objectType, objectId] = record.slice(0, separator).split(" ");
    if (mode === undefined || objectType === undefined || objectId === undefined) {
      throw new Error(`Unexpected ls-tree output: ${record}`);
    }
    if (objectType !== "blob" || !mode.startsWith("100")) continue;
    const path = relativeTreePath(repositoryDirectory, record.slice(separator + 1));
    if (path !== undefined) blobs.set(path, objectId);
  }
  return blobs;
};

const hashWorkingFiles = async (
  git: SimpleGit,
  directory: string,
  paths: ReadonlyArray<string>,
): Promise<ReadonlyMap<string, string>> => {
  if (paths.length === 0) return new Map();
  const workingBlobs = new Map<string, string>();
  for (let offset = 0; offset < paths.length; offset += 128) {
    const batch = paths.slice(offset, offset + 128);
    const output = await git.raw([
      "hash-object",
      "--no-filters",
      "--",
      ...batch.map((path) => `${directory}/${path}`),
    ]);
    const hashes = output.trimEnd().split("\n");
    if (hashes.length !== batch.length) {
      throw new Error(`Expected ${batch.length} working-tree hashes, received ${hashes.length}`);
    }
    for (const [index, path] of batch.entries()) {
      const hash = hashes[index];
      if (hash === undefined) throw new Error(`Missing working-tree hash for '${path}'`);
      workingBlobs.set(path, hash);
    }
  }
  return workingBlobs;
};

const readHeadRevision = async (git: SimpleGit): Promise<string | undefined> => {
  try {
    return (await git.revparse(["--verify", "HEAD"])).trim();
  } catch (cause) {
    try {
      const symbolicRef = (await git.raw(["symbolic-ref", "--quiet", "HEAD"])).trim();
      const refObject = (
        await git.raw(["for-each-ref", "--format=%(objectname)", symbolicRef])
      ).trim();
      if (refObject.length === 0) return undefined;
      throw cause;
    } catch {
      throw cause;
    }
  }
};

/** One raw regular-file difference between a Git HEAD subtree and the working tree. */
export interface GitDirectoryDifference {
  readonly path: string;
  readonly change: "added" | "modified" | "deleted";
  readonly headObject?: string;
  readonly workingObject?: string;
}

/** Git evidence for one directory, before feature-specific archive filtering. */
export interface GitDirectoryComparisonResult {
  readonly repositoryRoot: string;
  readonly repositoryDirectory: string;
  readonly headRevision?: string;
  readonly differences: ReadonlyArray<GitDirectoryDifference>;
}

// -----------------------------------------------------------------------------
// Git Operations
// -----------------------------------------------------------------------------

/**
 * Shallow clone a git repository (depth 1, single branch).
 * Significantly faster than a full clone for read-only use cases like skill discovery.
 *
 * @param url - Repository URL (HTTPS or SSH)
 * @param destination - Local path to clone to
 * @param ref - Optional git ref (branch or tag) to clone
 * @returns Effect that resolves on success or fails with GitError
 *
 * @experimental This API is unstable and may change without notice.
 */
export const shallowClone = (url: string, destination: string, ref?: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    return yield* Effect.tryPromise({
      try: (signal) =>
        createGit(path.dirname(destination), signal).clone(url, destination, [
          "--depth",
          "1",
          "--single-branch",
          ...(ref ? ["--branch", ref] : []),
        ]),
      catch: mapGitError("clone", `Failed to shallow clone ${url}`),
    });
  }).pipe(Effect.withSpan("Git.shallowClone"));

/** Get the immutable commit checked out at HEAD. */
export const getCommitSha = (repoPath: string) =>
  Effect.tryPromise({
    try: async (signal) => (await createGit(repoPath, signal).revparse(["HEAD"])).trim(),
    catch: mapGitError("get-commit-sha", "Failed to get checked-out commit SHA"),
  }).pipe(Effect.withSpan("Git.getCommitSha"));

/**
 * Get the git tree SHA for a path within a repository.
 *
 * The tree SHA is a hash of the directory's contents at the current commit.
 * Unlike commit SHA, it is stable across rebases that don't change content.
 *
 * @param repoPath - Path to the git repository root
 * @param subPath - Optional subpath within the repository (defaults to root ".")
 * @returns Effect that resolves to the tree SHA, or fails if path is not in a git repo
 *
 * @experimental This API is unstable and may change without notice.
 */
export const getTreeSha = (repoPath: string, subPath = ".") =>
  Effect.tryPromise({
    try: async (signal) => {
      const git = createGit(repoPath, signal);

      // For root directory, use rev-parse HEAD^{tree}
      if (subPath === "." || subPath === "") {
        const result = await git.revparse(["HEAD^{tree}"]);
        return result.trim();
      }

      // For subdirectories, use ls-tree to get the tree object SHA
      // ls-tree returns: <mode> <type> <sha>\t<path>
      const result = await git.raw(["ls-tree", "HEAD", subPath]);
      const trimmed = result.trim();
      if (!trimmed) {
        throw new Error(`Path '${subPath}' not found in repository`);
      }
      // Parse the output: "040000 tree <sha>\t<path>" or "100644 blob <sha>\t<path>"
      const parts = trimmed.split(/\s+/);
      const sha = Option.getOrThrowWith(
        Array.get(parts, 2),
        () => new Error(`Unexpected ls-tree output: ${trimmed}`),
      );
      return sha;
    },
    catch: mapGitError("get-tree-sha", `Failed to get tree SHA for '${subPath}'`),
  }).pipe(Effect.withSpan("Git.getTreeSha"));

/**
 * Compare an exact set of current regular files with the corresponding Git
 * HEAD subtree. The caller owns which current paths belong to its material
 * boundary; deleted HEAD paths remain present in the returned difference set
 * so that boundary can classify them too.
 */
export const compareDirectoryToHead = (
  repositoryRoot: string,
  directory: string,
  currentPaths: ReadonlyArray<string>,
) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    return yield* Effect.tryPromise({
      try: async (signal) => {
        const git = createGit(repositoryRoot, signal);
        const repositoryDirectory = toPosixPath(path.relative(repositoryRoot, directory), path.sep);
        const normalizedDirectory = repositoryDirectory.length === 0 ? "." : repositoryDirectory;
        const headRevision = await readHeadRevision(git);
        if (headRevision === undefined) {
          return {
            repositoryRoot,
            repositoryDirectory: normalizedDirectory,
            differences: [...currentPaths]
              .sort((left, right) => left.localeCompare(right))
              .map((currentPath) => ({ path: currentPath, change: "added" as const })),
          } satisfies GitDirectoryComparisonResult;
        }

        const treeOutput = await git.raw([
          "ls-tree",
          "-r",
          "-z",
          "--full-tree",
          "HEAD",
          "--",
          normalizedDirectory,
        ]);
        const headBlobs = parseHeadBlobs(treeOutput, normalizedDirectory);
        const workingBlobs = await hashWorkingFiles(git, directory, currentPaths);
        const allPaths = [...new Set([...headBlobs.keys(), ...workingBlobs.keys()])].sort(
          (left, right) => left.localeCompare(right),
        );
        const differences = allPaths.flatMap(
          (currentPath): ReadonlyArray<GitDirectoryDifference> => {
            const headObject = headBlobs.get(currentPath);
            const workingObject = workingBlobs.get(currentPath);
            if (headObject === workingObject) return [];
            if (headObject === undefined) {
              return workingObject === undefined
                ? []
                : [{ path: currentPath, change: "added", workingObject }];
            }
            if (workingObject === undefined) {
              return [{ path: currentPath, change: "deleted", headObject }];
            }
            return [{ path: currentPath, change: "modified", headObject, workingObject }];
          },
        );
        return {
          repositoryRoot,
          repositoryDirectory: normalizedDirectory,
          headRevision,
          differences,
        } satisfies GitDirectoryComparisonResult;
      },
      catch: mapGitError(
        "compare-directory-to-head",
        `Failed to compare '${directory}' with Git HEAD`,
      ),
    });
  }).pipe(Effect.withSpan("Git.compareDirectoryToHead"));
