# Change: Align Tests with Guidelines

## Why

The test suite is largely compliant (92%) but has gaps:

1. **Missing command tests**: CLI command files (`command.ts`) lack corresponding tests, while handler tests exist
2. **Core package test location**: Core tests use `__tests__/` subdirectories, which is inconsistent with CLI's colocation convention
3. **Missing E2E coverage**: Some CLI behaviors tested only at handler level, not end-to-end

Addressing these gaps improves:

- Consistency across packages
- Confidence in yargs parsing and option validation
- Coverage of full user-facing behavior

## What Changes

- Add missing `command.test.ts` files for CLI commands (yargs parsing/options tests)
- Colocate core package tests alongside source files (move from `__tests__/`)
- Add E2E test for `axm` root command behavior

## Impact

- Affected specs: `core` (add test colocation requirement)
- Affected code:
  - `packages/cli/src/commands/init/command.ts` (add test)
  - `packages/cli/src/commands/skills/add/command.ts` (add test)
  - `packages/core/src/experimental/skills/__tests__/*.test.ts` (relocate)
  - `packages/cli/e2e/` (add root command test)
