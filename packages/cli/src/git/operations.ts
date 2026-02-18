/**
 * Git operations for cloning repositories at specific refs.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import simpleGit, { type SimpleGit, type SimpleGitOptions } from "simple-git";

import { type CliError, makeCliError } from "../cli-error/index.js";

// -----------------------------------------------------------------------------
// Internal Helpers
// -----------------------------------------------------------------------------

/**
 * Creates a simple-git instance with options that allow SSH passphrase prompts.
 * Using 'inherit' for stdio enables interactive authentication.
 */
const createGit = (baseDir?: string): SimpleGit => {
  const options: Partial<SimpleGitOptions> = {
    baseDir: baseDir ?? process.cwd(),
    binary: "git",
    maxConcurrentProcesses: 1,
    config: [],
  };

  return simpleGit(options);
};

type GitOperation =
  | "clone"
  | "checkout"
  | "resolve-ref"
  | "get-commit"
  | "get-tree-sha"
  | "is-git-repo";

const operationToCode: Record<GitOperation, string> = {
  clone: "GIT_CLONE_FAILED",
  checkout: "GIT_CHECKOUT_FAILED",
  "resolve-ref": "GIT_RESOLVE_REF_FAILED",
  "get-commit": "GIT_GET_COMMIT_FAILED",
  "get-tree-sha": "GIT_GET_TREE_SHA_FAILED",
  "is-git-repo": "GIT_IS_GIT_REPO_FAILED",
};

/**
 * Maps unknown errors to CliError with appropriate context.
 */
const mapGitError =
  (operation: GitOperation, context?: string) =>
  (error: unknown): CliError => {
    const baseMessage = context ?? `Git ${operation} failed`;
    const details = error instanceof Error ? [error.message] : [String(error)];

    return makeCliError({
      code: operationToCode[operation],
      what: baseMessage,
      details,
      cause: error,
    });
  };

// -----------------------------------------------------------------------------
// Git Operations
// -----------------------------------------------------------------------------

/**
 * Clone a git repository to destination.
 * If ref provided, checkout that ref after clone.
 *
 * @param url - Repository URL (HTTPS or SSH)
 * @param destination - Local path to clone to
 * @param ref - Optional git ref (tag, branch, or SHA) to checkout
 * @returns Effect that resolves on success or fails with GitError
 *
 * @experimental This API is unstable and may change without notice.
 */
export const cloneRepo = Effect.fn("Git.cloneRepo")(function* (
  url: string,
  destination: string,
  ref?: string,
) {
    // Clone the repository
    yield* Effect.tryPromise({
      try: () => createGit().clone(url, destination),
      catch: mapGitError("clone", `Failed to clone ${url}`),
    });

    // If ref provided, checkout that ref
    if (ref) {
      yield* Effect.tryPromise({
        try: () => createGit(destination).checkout(ref),
        catch: mapGitError("checkout", `Failed to checkout ref '${ref}'`),
      });
    }
  });

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
  Effect.tryPromise({
    try: () =>
      createGit().clone(url, destination, [
        "--depth",
        "1",
        "--single-branch",
        ...(ref ? ["--branch", ref] : []),
      ]),
    catch: mapGitError("clone", `Failed to shallow clone ${url}`),
  }).pipe(Effect.withSpan("Git.shallowClone"));

/**
 * Resolve a ref (tag, branch, SHA) to a full commit SHA.
 *
 * @param repoPath - Path to the git repository
 * @param ref - Git ref to resolve (tag, branch, or SHA)
 * @returns Effect that resolves to the full commit SHA
 *
 * @experimental This API is unstable and may change without notice.
 */
export const resolveRef = (repoPath: string, ref: string) =>
  Effect.tryPromise({
    try: async () => {
      const git = createGit(repoPath);
      // rev-parse resolves any ref to its full SHA
      const sha = await git.revparse([ref]);
      return sha.trim();
    },
    catch: mapGitError("resolve-ref", `Failed to resolve ref '${ref}'`),
  }).pipe(Effect.withSpan("Git.resolveRef"));

/**
 * Get the current HEAD commit SHA.
 * Used after clone to record in lockfile.
 *
 * @param repoPath - Path to the git repository
 * @returns Effect that resolves to the current HEAD commit SHA
 *
 * @experimental This API is unstable and may change without notice.
 */
export const getCurrentCommit = (repoPath: string) =>
  Effect.tryPromise({
    try: async () => {
      const git = createGit(repoPath);
      const sha = await git.revparse(["HEAD"]);
      return sha.trim();
    },
    catch: mapGitError("get-commit", "Failed to get current commit"),
  }).pipe(Effect.withSpan("Git.getCurrentCommit"));

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
    try: async () => {
      const git = createGit(repoPath);

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
 * Check if a directory is within a git repository.
 *
 * @param dirPath - Path to check
 * @returns Effect that resolves to true if in a git repo, false otherwise
 *
 * @experimental This API is unstable and may change without notice.
 */
export const isGitRepository = (dirPath: string) =>
  Effect.tryPromise({
    try: () => createGit(dirPath).revparse(["--git-dir"]),
    catch: mapGitError("is-git-repo", `Failed to check git repository at '${dirPath}'`),
  }).pipe(
    Effect.as(true),
    Effect.catchAll(() => Effect.succeed(false)),
    Effect.withSpan("Git.isGitRepository"),
  );
