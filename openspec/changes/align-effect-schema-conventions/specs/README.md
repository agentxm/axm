# Specs: align-effect-schema-conventions

## No Specification Changes

This change is a **pure internal refactoring** with no user-facing or API behavior changes.

- **No new capabilities** - Only renaming existing schema constants
- **No modified capabilities** - Runtime behavior unchanged
- **No removed capabilities** - All functionality preserved

The change updates internal naming conventions to match the effect-schema skill:

- Schema constants: `Author` → `AuthorSchema`
- Types: `Author` (unchanged)

All existing tests continue to validate the same behavior after import updates.
