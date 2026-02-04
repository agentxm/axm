## Why

CLI handlers (`install`, `uninstall`) use the legacy `skills/state/apply.ts` pipeline, while the authoritative implementation lives in `workspace/apply.ts`. This creates duplicate code paths, inconsistent behavior potential, and blocks deletion of the legacy modules. Completing the migration enables codebase simplification and establishes workspace V2 as the single source of truth.

## What Changes

- **Migrate install handler** to use `workspace/apply.ts` pipeline (`loadCurrentState` → `buildIdealState` → `buildPlan` → `applyPlan`)
- **Migrate uninstall handler** to use `workspace/apply.ts` pipeline
- **Delete legacy modules** after migration:
  - `skills/state/apply.ts` (and tests)
  - `skills/state/load.ts` (and tests)
  - `skills/state/ideal.ts` (and tests)
  - `skills/state/diff.ts` (and tests)
- **Update exports** in `skills/state/index.ts` and `skills/index.ts` to remove deleted module references

## Capabilities

### New Capabilities

_None - this is an internal refactor with no new user-facing capabilities._

### Modified Capabilities

_None - user-facing behavior is unchanged. The `cli-skills-install` and `cli-skills-uninstall` specs remain valid; only internal implementation changes._

## Impact

- **Code**: `packages/cli/src/commands/skills/install/handler.ts`, `packages/cli/src/commands/skills/uninstall/handler.ts`
- **Deleted**: `packages/core/src/experimental/skills/state/{apply,load,ideal,diff}.ts` + tests
- **Dependencies**: Handlers will depend on `workspace/` module instead of `skills/state/`
- **Tests**: Handler tests need mock updates for workspace pipeline; E2E tests unchanged
