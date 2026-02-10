# Change: Align Codebase with CLAUDE.md Project Structure

## Why

The current codebase structure does not consistently follow the project structure defined in CLAUDE.md. This creates confusion for contributors and AI assistants working in the codebase, and makes it harder to maintain consistent patterns.

## What Changes

- **CLI commands reorganization**: Move handler files into `<command>/<subcommand>/` directories per the documented structure
- **Test colocation**: Move tests from `__tests__/` subdirectories to colocate `handler.test.ts` alongside `handler.ts`
- **Remove empty directories**: Clean up empty directories (`init/`, `skills/add/`) that were partially created

## Impact

- Affected specs: `cli`, `cli-init`, `cli-skills`, `cli-skills-add`
- Affected code:
  - `packages/cli/src/commands/init.ts` → `packages/cli/src/commands/init/command.ts`
  - `packages/cli/src/commands/init.handler.ts` → `packages/cli/src/commands/init/handler.ts`
  - `packages/cli/src/commands/__tests__/init.handler.test.ts` → `packages/cli/src/commands/init/handler.test.ts`
  - `packages/cli/src/commands/skills.ts` → `packages/cli/src/commands/skills/command.ts`
  - `packages/cli/src/commands/skills.test.ts` → `packages/cli/src/commands/skills/command.test.ts`
  - `packages/cli/src/commands/skills/add.ts` → `packages/cli/src/commands/skills/add/command.ts`
  - `packages/cli/src/commands/skills/add.handler.ts` → `packages/cli/src/commands/skills/add/handler.ts`
  - `packages/cli/src/commands/skills/__tests__/add.handler.test.ts` → `packages/cli/src/commands/skills/add/handler.test.ts`
