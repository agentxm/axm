/**
 * Typed failure families for workspace-state operations: layout validation,
 * initialization gating, facade entry lookups, and managed filesystem
 * primitives. Fields are domain facts; the application error boundary owns
 * rendering, codes, and suggestions.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Data from "effect/Data";

/**
 * Workspace layout configuration or on-disk authored roots are invalid.
 * `detail` carries the exact fact sentence the validation produced.
 */
export class WorkspaceLayoutError extends Data.TaggedError("WorkspaceLayoutError")<{
  readonly detail: string;
  readonly cause?: unknown;
}> {}

/** The workspace has no settings file; it must be initialized first. */
export class WorkspaceNotInitialized extends Data.TaggedError("WorkspaceNotInitialized")<{
  readonly settingsPath: string;
}> {}

/** A skill directory was requested but the lockfile holds no entry for it. */
export class LockedSkillMissing extends Data.TaggedError("LockedSkillMissing")<{
  readonly name: string;
}> {}

/** A settings entry update targeted a name that has no configured entry. */
export class SettingsEntryMissing extends Data.TaggedError("SettingsEntryMissing")<{
  readonly entryType: "skill" | "mcp-server";
  readonly name: string;
}> {}

/** The agent ID is not a configurable agent. */
export class InvalidAgentId extends Data.TaggedError("InvalidAgentId")<{
  readonly agentId: string;
  readonly cause: unknown;
}> {}

/** Pack retention cannot be decided because the desired pack graph is incomplete. */
export class DesiredPackGraphIncomplete extends Data.TaggedError("DesiredPackGraphIncomplete") {}

/** Removing a canonical extension path failed. */
export class CanonicalPathRemovalError extends Data.TaggedError("CanonicalPathRemovalError")<{
  readonly path: string;
  readonly step: "inspect" | "remove";
  readonly cause: unknown;
}> {}

/**
 * Creating or replacing a managed symlink failed. `path` carries the fact
 * each step's message interpolates: the parent directory for `mkdir-parent`,
 * the link path otherwise (`resolve-target` interpolates nothing).
 */
export class SymlinkCreationError extends Data.TaggedError("SymlinkCreationError")<{
  readonly path: string;
  readonly step: "resolve-target" | "remove-existing" | "mkdir-parent" | "symlink";
  readonly cause: unknown;
}> {}
