/**
 * WorkspaceMutations scope helpers for CLI flags and workspace options.
 *
 * `project` uses `./.axm`, while `user` uses `~/.axm`.
 *
 * @experimental This API is unstable and may change without notice.
 */

export const WORKSPACE_SCOPES = ["project", "user"] as const;

export type WorkspaceScope = (typeof WORKSPACE_SCOPES)[number];

export const DEFAULT_WORKSPACE_SCOPE: WorkspaceScope = "project";
