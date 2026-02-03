# Internal Refactoring: No User-Facing Changes

This change is a purely internal refactoring of the lockfile schema implementation.

## Summary

- **No new capabilities** are introduced
- **No existing capabilities** are modified
- **No user-facing behavior** changes

The change consolidates duplicate type definitions and aligns internal schemas with the design specification. All changes are to internal implementation details only.

## Why No Specs?

Specs define WHAT the system should do from a user's perspective. This change:

1. Consolidates 5 different representations of skill sources into 1
2. Removes duplicate type definitions across 4 files
3. Aligns `schemas/lockfile.ts` with the `dry-run.md` design
4. Removes legacy/V2 suffixed types

None of these affect observable behavior. Users will not notice any difference after this change is implemented.

## Testing Approach

Since no user-facing behavior changes:

- Existing tests validate current behavior is preserved
- Unit tests will be updated to use the consolidated types
- No new acceptance criteria required
