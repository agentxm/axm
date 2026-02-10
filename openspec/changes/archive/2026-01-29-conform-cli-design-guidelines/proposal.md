# Proposal: Conform CLI to Design Guidelines

## Summary

Update the CLI to conform to the CLI design guidelines, specifically:

1. Remove the unused `extensions` parent command (replaced by `skills`)
2. Implement friendly "welcome, don't scold" behavior for root CLI and parent
   commands
3. Update root CLI to show help when invoked without arguments (exit 0, not
   "AgentXM CLI ready")

## Motivation

The CLI design guidelines document specifies that parent commands (and the root
command) should welcome users when invoked without arguments—help them discover
what's available rather than scold them for not knowing.

Currently:

- `axm` outputs "AgentXM CLI ready" and exits, providing no guidance
- `axm skills` outputs an error: "Please specify a sub-command for skills"
- `axm extensions` exists but has no subcommands and is superseded by `skills`

## Scope

### In Scope

- Remove `extensions` command and its spec
- Update root CLI to show help on empty invocation (exit 0)
- Update `skills` parent command to use friendly welcome pattern
- Update related specs to reflect new behavior

### Out of Scope

- Changes to `init` command (standalone command, not a parent command)
- Changes to `skills add` subcommand (already conforms to guidelines)
- New features or commands

## Related Specs

- `cli` - Root CLI behavior (MODIFIED)
- `cli-skills` - Skills parent command behavior (MODIFIED)
- `cli-init` - No changes (standalone command)
- `cli-skills-add` - No changes (subcommand)

## Success Criteria

1. `axm` shows help and exits 0
2. `axm skills` shows help and exits 0
3. `axm extensions` returns "command not found" error
4. All existing tests pass
5. New tests verify friendly welcome behavior
