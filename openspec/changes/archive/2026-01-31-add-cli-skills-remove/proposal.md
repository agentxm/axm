# Change: Add skills remove sub-command

## Why

The `skills` command needs a `remove` sub-command to complete the skill management lifecycle. This proposal adds the initial scaffolding with placeholder behavior.

## What Changes

- Add `remove` sub-command under `skills`
- Initial implementation prints "Hello Alex" to console
- Follow existing `add` command structure as pattern

## Impact

- Affected specs: cli-skills, cli-skills-remove (new)
- Affected code: `packages/cli/src/commands/skills/`
