/**
 * Git operations for cloning repositories at specific refs.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import { Data, Effect } from "effect";
import simpleGit, { type SimpleGit, type SimpleGitOptions } from "simple-git";

// -----------------------------------------------------------------------------
// Error Types
// -----------------------------------------------------------------------------

/**
 * Error type for git operations.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class GitError extends Data.TaggedError("GitError")<{
  /** What operation failed */
  readonly operation: "clone" | "checkout" | "resolve-ref" | "get-commit";
  /** Human-readable error message */
  readonly message: string;
  /** Original error cause */
  readonly cause?: unknown;
}> {}

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

/**
 * Maps unknown errors to GitError with appropriate context.
 */
const mapGitError =
  (operation: GitError["operation"], context?: string) =>
  (error: unknown): GitError => {
    const baseMessage = context ?? `Git ${operation} failed`;

    if (error instanceof Error) {
      return new GitError({
        operation,
        message: `${baseMessage}: ${error.message}`,
        cause: error,
      });
    }

    return new GitError({
      operation,
      message: `${baseMessage}: ${String(error)}`,
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
export const cloneRepo = (
  url: string,
  destination: string,
  ref?: string,
): Effect.Effect<void, GitError> =>
  Effect.gen(function* () {
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
 * Resolve a ref (tag, branch, SHA) to a full commit SHA.
 *
 * @param repoPath - Path to the git repository
 * @param ref - Git ref to resolve (tag, branch, or SHA)
 * @returns Effect that resolves to the full commit SHA
 *
 * @experimental This API is unstable and may change without notice.
 */
export const resolveRef = (repoPath: string, ref: string): Effect.Effect<string, GitError> =>
  Effect.tryPromise({
    try: async () => {
      const git = createGit(repoPath);
      // rev-parse resolves any ref to its full SHA
      const sha = await git.revparse([ref]);
      return sha.trim();
    },
    catch: mapGitError("resolve-ref", `Failed to resolve ref '${ref}'`),
  });

/**
 * Get the current HEAD commit SHA.
 * Used after clone to record in lockfile.
 *
 * @param repoPath - Path to the git repository
 * @returns Effect that resolves to the current HEAD commit SHA
 *
 * @experimental This API is unstable and may change without notice.
 */
export const getCurrentCommit = (repoPath: string): Effect.Effect<string, GitError> =>
  Effect.tryPromise({
    try: async () => {
      const git = createGit(repoPath);
      const sha = await git.revparse(["HEAD"]);
      return sha.trim();
    },
    catch: mapGitError("get-commit", "Failed to get current commit"),
  });
