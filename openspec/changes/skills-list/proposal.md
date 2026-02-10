## Why

There is no way to see what skills are currently installed. Users need to inspect
the lockfile manually to understand what's in their project or global scope. A
`skills list` command provides a quick, filterable view of installed skills.

## What Changes

- Add `skills list` sub-command (alias `ls`) that reads the lockfile and displays
  installed skills
- Support `--global` flag to list globally-installed skills (defaults to project
  scope)
- Support `--agent <id>` flag (repeatable) to filter results by agent

## Capabilities

### New Capabilities

- `cli-skills-list`: CLI command definition, argument parsing, and handler for
  `axm skills list`

### Modified Capabilities

- `cli-skills`: Add `list` (alias `ls`) as a registered sub-command

## Impact

- New files under `packages/cli/src/cli-commands/skills/list/`
- Reads from lockfile service (existing) — no write operations
- Modifies `cli-commands/skills/command.ts` to register the new sub-command
