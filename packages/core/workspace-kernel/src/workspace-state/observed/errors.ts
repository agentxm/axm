/** Typed failures of the workspace read model's root, discovery, and agent scans. */

import * as Data from "effect/Data";

/** Provider-construction error: workspace root escapes the configured allowed root. */
export class WorkspaceRootEscape extends Data.TaggedError("WorkspaceRootEscape")<{
  readonly workspaceRoot: string;
  readonly allowedRoot: string;
}> {}

/** The skill discovery search root is missing, inaccessible, or not a directory. */
export class SkillDiscoveryRootInvalid extends Data.TaggedError("SkillDiscoveryRootInvalid")<{
  readonly searchRoot: string;
  readonly problem: "inaccessible" | "not-directory";
  readonly cause?: unknown;
}> {}

/** Scanning an agent's subagent files failed. */
export class SubagentScanFailed extends Data.TaggedError("SubagentScanFailed")<{
  readonly agentName: string;
  readonly cause: unknown;
}> {}
