# Change: Align CLI with cli-conventions skill

## Why

The `.claude/skills/cli-conventions/SKILL.md` defines CLI design standards for yargs + Effect architecture, standard flags, interactive prompts, output conventions, error handling, and testing patterns. The current CLI implementation has gaps that prevent full alignment with these conventions.

## What Changes

- Add standard flags (`--verbose`, `--quiet`, `--json`, `--non-interactive`) to root CLI and commands
- Add TTY detection for interactive prompts (check `process.stdin.isTTY` before prompting)
- Add TTY detection for output formatting (check `process.stdout.isTTY` for colors/spinners)
- Improve error messages to include recovery guidance
- Add yargs parser unit tests using `.exitProcess(false)` and `.fail(false)` pattern
- Ensure `--non-interactive` flag provides fallback behavior for all prompts

## Impact

- Affected specs: `cli`
- Affected code:
  - `packages/cli/src/main.ts` - add global standard flags
  - `packages/cli/src/commands/init/command.ts` - wire standard flags
  - `packages/cli/src/commands/init/handler.ts` - add TTY detection, improve errors
  - `packages/cli/src/commands/skills/add/command.ts` - wire standard flags
  - `packages/cli/src/commands/skills/add/handler.ts` - add TTY detection, improve errors
  - `packages/cli/src/commands/init/command.test.ts` - add parser unit tests
  - `packages/cli/src/commands/skills/add/command.test.ts` - add parser unit tests
