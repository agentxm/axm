/**
 * WorkspaceMutations scope helpers for CLI flags and workspace options.
 *
 * `project` uses the project root; `user` uses `~/.axm/workspace/`.
 *
 * @experimental This API is unstable and may change without notice.
 */

export const WORKSPACE_SCOPES = ["project", "user"] as const;

export type WorkspaceScope = (typeof WORKSPACE_SCOPES)[number];

export const DEFAULT_WORKSPACE_SCOPE: WorkspaceScope = "project";
