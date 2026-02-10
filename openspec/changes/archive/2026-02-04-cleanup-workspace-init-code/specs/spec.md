# Cleanup Workspace Init Code

No specification changes.

This change removes internal implementation code that was never part of any user-facing specification. The removed modules (`init-types`, `init-state`, `init-diff`, `init-apply`) were internal utilities with no external consumers.

The `axm init` command behavior remains unchanged - it continues to work through `WorkspaceContext.make()`.
