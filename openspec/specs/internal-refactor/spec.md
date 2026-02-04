# Internal Refactoring: No User-Facing Changes

This spec documents internal refactoring changes that have no user-facing behavior modifications.

## Summary

- **No new capabilities** are introduced
- **No existing capabilities** are modified
- **No user-facing behavior** changes

## Lockfile Schema Consolidation

The change consolidates duplicate type definitions and aligns internal schemas with the design specification. All changes are to internal implementation details only.

### Scope

1. Consolidates 5 different representations of skill sources into 1
2. Removes duplicate type definitions across 4 files
3. Aligns `schemas/lockfile.ts` with the `dry-run.md` design
4. Removes legacy/V2 suffixed types

## CLI Handler Migration to Workspace V2

Migrate CLI handlers from legacy `skills/state/` pipeline to `workspace/` V2 pipeline.

### Scope

**Affected specs**: None - `cli-skills-install` and `cli-skills-uninstall` requirements remain unchanged.

**Verification**: All existing E2E tests pass without modification.

## Why No User-Facing Specs?

Specs define WHAT the system should do from a user's perspective. These internal refactors don't affect observable behavior. Users will not notice any difference after these changes are implemented.

## Testing Approach

Since no user-facing behavior changes:

- Existing tests validate current behavior is preserved
- Unit tests will be updated to use the consolidated types
- No new acceptance criteria required
