# Basic usage

Use this when you are in an existing axm workspace and need to understand what
is safe to inspect, what changes workspace state, and where to look next.

## Start read-only

Begin with a read-only workspace check:

```bash
axm lint
```

Treat its findings as the workspace map. It tells you what axm manages, what is
missing, what is stale, and what may need reconciliation.

## Build context before changing state

Before installing, updating, pruning, or fixing anything:

- Check the root command list with `axm --help`.
- Read command-specific behavior with `axm <command> --help`.
- Prefer preview or dry-run modes when a command offers them.
- Prefer JSON output when another tool or agent needs to inspect results.

## Common decision path

If the workspace looks healthy, use command-specific help to choose the next
operation.

If configured extensions are missing, sync the workspace rather than adding new
configuration first.

If managed files are stale or drifted, inspect the lint findings before applying
fixes or pruning files.

If you need concepts rather than commands, read:

```bash
axm help workspace
```

## Safety notes

axm owns managed files under its workspace configuration. Avoid hand-editing
generated or managed agent files until you understand whether axm will rewrite
them.

Do not commit workspace changes just because a command completed. Review the
diff and confirm the changed files match the intended operation.
