# Workspace

An axm workspace is the configuration and installed extension state that axm
manages for a project or user.

## Layout

Project workspaces store state in `.axm/`:

- `settings.json` records agents, registry settings, and preferences.
- `axm-lock.yaml` records resolved extension versions.
- `extensions/` stores installed extension source files.

## Common flows

Run `axm setup` once to create workspace settings.

Run `axm install` to sync configured extensions, or pass a registry reference to
add one extension.

Run `axm lint` to inspect workspace drift. Use `axm lint --fix` to reconcile
managed files non-interactively.

Run `axm prune` to remove stale managed files that no longer match workspace
configuration.

Use `--scope user` on supported commands when you want user-level configuration
instead of project-level configuration.
