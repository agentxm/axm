## Why

The `core` package was created anticipating shared logic across multiple consumers, but in practice all code is consumed only by the CLI. Maintaining two packages adds indirection without benefit. Consolidating into a single `cli` package simplifies the codebase and reduces cognitive overhead.

## What Changes

- Move `clack-effect/` from `cli/src/services/` to `cli/src/clack-effect/`
- Rename `workspace-context/` to `workspace/` and move to `cli/src/workspace/`
- Move `agents/`, `resolution/`, `skills/` from `core/src/experimental/` to `cli/src/`
- Merge `core/src/experimental/workspace/` contents into `cli/src/workspace/`
- Move `paths.ts` into `cli/src/workspace/`
- Delete empty `cli/src/services/` directory
- Delete `packages/core/` package entirely
- Update all import paths across the codebase

## Capabilities

### New Capabilities

None. This is a pure structural refactoring.

### Modified Capabilities

None. No behavioral or API changes.

## Impact

- **Import paths**: All imports from `@axm.sh/core` become relative imports within `@axm.sh/cli`
- **Package dependencies**: `packages/core/` is removed from the monorepo
- **pnpm workspace**: Remove `core` from workspace configuration
- **tsconfig**: Update path mappings if any exist
