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
