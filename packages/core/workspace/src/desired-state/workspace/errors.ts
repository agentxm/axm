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

/** A lockfile entry references a source name that is not configured. */
export class LockEntrySourceMissing extends Data.TaggedError("LockEntrySourceMissing")<{
  readonly entryType: string;
  readonly sourceName: string;
}> {}

/** A lockfile source URL failed to parse. */
export class LockEntryUrlInvalid extends Data.TaggedError("LockEntryUrlInvalid")<{
  readonly value: string;
}> {}

/** A lockfile extension name failed to decode. */
export class LockEntryNameInvalid extends Data.TaggedError("LockEntryNameInvalid")<{
  readonly name: string;
}> {}

/**
 * A lockfile entry and the source configuration disagree about a named
 * source's endpoint. `sourceKind` carries the wording the entry uses:
 * "Registry" for registry entries, the source type otherwise.
 */
export class LockEntryEndpointConflict extends Data.TaggedError("LockEntryEndpointConflict")<{
  readonly sourceKind: string;
  readonly sourceName: string;
  readonly acceptedEndpoint: string;
  readonly resolvedEndpoint: string;
}> {}

/** Configuration does not resolve a lockfile entry's source name to its type. */
export class LockEntrySourceTypeConflict extends Data.TaggedError("LockEntrySourceTypeConflict")<{
  readonly sourceKind: string;
  readonly sourceName: string;
}> {}

/** The accepted lock authority holds no resolution for the requested extension. */
export class AcceptedResolutionMissing extends Data.TaggedError("AcceptedResolutionMissing")<{
  readonly label: string;
  readonly name: string;
}> {}

/** An inline-configured entry has no package source, so no ref can be resolved. */
export class InlineExtensionSourceMissing extends Data.TaggedError("InlineExtensionSourceMissing")<{
  readonly name: string;
}> {}

/** Removing a superseded canonical package during transition preparation failed. */
export class SupersededCanonicalRemovalFailed extends Data.TaggedError(
  "SupersededCanonicalRemovalFailed",
)<{
  readonly path: string;
  readonly cause: unknown;
}> {}

/** Hashing package content for the advisory change marker failed. */
export class PackageContentHashFailed extends Data.TaggedError("PackageContentHashFailed")<{
  readonly packageDir: string;
  readonly cause: unknown;
}> {}

/**
 * A configured workspace source failed validation against the canonical
 * workspace package. `detail` carries the fact sentence the validation
 * produced; rendering and recovery guidance stay at the boundary.
 */
export class WorkspaceSourceInvalid extends Data.TaggedError("WorkspaceSourceInvalid")<{
  readonly source: string;
  readonly detail: string;
  readonly cause?: unknown;
}> {}
