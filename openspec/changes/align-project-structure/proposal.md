# Change: Align codebase to CLAUDE.md project structure

## Why

The current codebase structure diverges from the documented project structure in CLAUDE.md. This creates confusion for contributors and AI assistants who expect the documented patterns but encounter different organization.

## What Changes

### CLI Package (`packages/cli/src/commands/`)

1. **Move commands into subdirectories**: Each command gets its own directory
   - `init.ts`, `init.handler.ts` → `init/index.ts`, `init/handler.ts`
   - `skills.ts` → `skills/index.ts`
   - `skills/add.ts`, `skills/add.handler.ts` → `skills/add/index.ts`, `skills/add/handler.ts`

2. **Colocate tests with source**: Move tests from `__tests__/` to sit next to their source files
   - `__tests__/init.handler.test.ts` → `init/handler.test.ts`
   - `skills/__tests__/add.handler.test.ts` → `skills/add/handler.test.ts`

3. **Remove empty `__tests__` directories** after migration

### Core Package (`packages/core/src/experimental/skills/`)

4. **Colocate tests with source**: Move tests from `__tests__/` to sit next to their source files
   - `__tests__/settings.test.ts` → `settings.test.ts`
   - `__tests__/installer.test.ts` → `installer.test.ts`
   - (etc. for all test files)

5. **Remove empty `__tests__` directory** after migration

## Impact

- Affected specs: None (structure change only, no behavior changes)
- Affected code: All source files in `packages/cli/src/commands/` and test files in `packages/core/src/experimental/skills/__tests__/`
- Import paths will need updating throughout the codebase
- E2E tests are already correctly placed in `packages/cli/e2e/` per the documented structure
