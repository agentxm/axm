/**
 * Error types for git operations.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Data from "effect/Data";
import * as Option from "effect/Option";

/**
 * Error type for git operations.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class GitError extends Data.TaggedError("GitError")<{
  /** What operation failed */
  readonly operation:
    | "clone"
    | "checkout"
    | "resolve-ref"
    | "get-commit"
    | "get-tree-sha"
    | "is-git-repo";
  /** Human-readable error message */
  readonly message: string;
  /** Original error cause */
  readonly cause: Option.Option<unknown>;
}> {}
