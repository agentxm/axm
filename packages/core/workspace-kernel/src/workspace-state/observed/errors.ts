/** Typed failures of the workspace read model's root and agent scans. */

import * as Data from "effect/Data";

/** Provider-construction error: workspace root escapes the configured allowed root. */
export class WorkspaceRootEscape extends Data.TaggedError("WorkspaceRootEscape")<{
  readonly workspaceRoot: string;
  readonly allowedRoot: string;
}> {}

/** Scanning an agent's subagent files failed. */
export class SubagentScanFailed extends Data.TaggedError("SubagentScanFailed")<{
  readonly agentName: string;
  readonly cause: unknown;
}> {}
