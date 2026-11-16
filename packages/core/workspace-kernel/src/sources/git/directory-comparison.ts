import * as ServiceMap from "effect/Context";
import type * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { GitOperationFailed } from "../errors.js";
import type { GitDirectoryComparisonResult, GitHeadFacts } from "./operations.js";

/** Input material for comparing one directory with its enclosing Git HEAD. */
interface GitDirectoryComparisonInput {
  readonly directory: string;
  readonly currentPaths: ReadonlyArray<string>;
  /**
   * What the caller already observed of the enclosing repository within the
   * same read: the Git root a walk from `directory` found (none when it found
   * none), and the HEAD facts an earlier comparison of that root returned.
   * Omitted, the comparison observes both itself.
   */
  readonly repository?: {
    readonly root: Option.Option<string>;
    readonly head?: GitHeadFacts;
  };
}

/** Git worktree comparison capability used by publication preflight. */
export interface GitDirectoryComparisonService {
  readonly compare: (
    input: GitDirectoryComparisonInput,
  ) => Effect.Effect<Option.Option<GitDirectoryComparisonResult>, GitOperationFailed>;
}

export class GitDirectoryComparison extends ServiceMap.Service<
  GitDirectoryComparison,
  GitDirectoryComparisonService
>()("@agentxm/workspace-kernel/sources/git/GitDirectoryComparison") {}
