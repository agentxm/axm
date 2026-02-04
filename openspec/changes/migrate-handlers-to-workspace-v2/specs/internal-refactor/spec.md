## Internal Refactor

This change is an internal refactor with no user-facing behavior modifications.

**Scope**: Migrate CLI handlers from legacy `skills/state/` pipeline to `workspace/` V2 pipeline.

**Affected specs**: None - `cli-skills-install` and `cli-skills-uninstall` requirements remain unchanged.

**Verification**: All existing E2E tests pass without modification.
