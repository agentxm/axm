import * as ServiceMap from "effect/Context";
import type * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { GitOperationFailed } from "../errors.js";
import type { GitDirectoryComparisonResult } from "./operations.js";

/** Input material for comparing one directory with its enclosing Git HEAD. */
export interface GitDirectoryComparisonInput {
  readonly directory: string;
  readonly currentPaths: ReadonlyArray<string>;
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
>()("@agentxm/extension-sources/git/GitDirectoryComparison") {}
