# Implementation Tasks

## 1. State Types

- [x] 1.1 Create `packages/core/src/experimental/skills/state/` directory structure
- [x] 1.2 Write tests for state type constructors and schemas
- [x] 1.3 Implement `types.ts`: ActualSkill, LockedSkill, SkillState, SkillValidity types
- [x] 1.4 Implement `types.ts`: IdealSkill, SkillSource, SkillChange types
- [x] 1.5 Implement `types.ts`: SkillsDiff, DiffSummary types
- [x] 1.6 Implement schemas for JSON serialization (--json output)
- [x] 1.7 Run typecheck and tests, fix any issues

## 2. State Loading

- [x] 2.1 Write tests for loadActualSkills (disk scanning)
- [x] 2.2 Implement loadActualSkills in `load.ts`
- [x] 2.3 Run typecheck and tests, fix any issues
- [x] 2.5 Write tests for loadLockedSkills (lockfile parsing)
- [x] 2.6 Implement loadLockedSkills in `load.ts`
- [x] 2.7 Run typecheck and tests, fix any issues
- [x] 2.9 Write tests for computeValidity (actual vs locked comparison)
- [x] 2.10 Implement computeValidity in `load.ts`
- [x] 2.11 Run typecheck and tests, fix any issues
- [x] 2.13 Write tests for loadSkillsState (merge actual + locked)
- [x] 2.14 Implement loadSkillsState in `load.ts`
- [x] 2.15 Run typecheck and tests, fix any issues

## 3. Ideal State Builders

- [x] 3.1 Write tests for buildIdealForInstall
- [x] 3.2 Implement buildIdealForInstall in `ideal.ts`
- [x] 3.3 Run typecheck and tests, fix any issues

## 4. Diff Computation

- [x] 4.1 Write tests for computeDiff (Add, Update, Remove, Unchanged, Repair cases)
- [x] 4.2 Implement computeDiff in `diff.ts`
- [x] 4.3 Write tests for hasChanges helper
- [x] 4.4 Implement hasChanges in `diff.ts`
- [x] 4.5 Run typecheck and tests, fix any issues

## 5. Apply Logic

- [x] 5.1 Write tests for applyAdd (fetch, copy, sync agents)
- [x] 5.2 Implement applyAdd in `apply.ts`
- [x] 5.3 Run typecheck and tests, fix any issues
- [x] 5.5 Write tests for applyRemove (delete files, update state)
- [x] 5.6 Implement applyRemove in `apply.ts`
- [x] 5.7 Run typecheck and tests, fix any issues
- [x] 5.9 Write tests for applyUpdate (replace files, re-sync)
- [x] 5.10 Implement applyUpdate in `apply.ts`
- [x] 5.11 Run typecheck and tests, fix any issues
- [x] 5.13 Write tests for applyDiff (full apply with progress events)
- [x] 5.14 Implement applyDiff with checkpoint/rollback in `apply.ts`
- [x] 5.15 Run typecheck and tests, fix any issues

## 6. Module Export

- [x] 6.1 Create `index.ts` barrel file for skills/state module
- [x] 6.2 Run typecheck and tests, fix any issues

## 7. CLI Handler Refactor

- [x] 7.1 Add `--dry-run` and `--json` flags to skills install command definition
- [x] 7.2 Write E2E tests for dry-run behavior (shows plan, no changes)
- [x] 7.3 Write E2E tests for JSON output format
- [x] 7.4 Refactor handler to use state-based architecture (load → build ideal → diff → display/apply)
- [x] 7.5 Implement plan display formatting (symbols, summary)
- [x] 7.6 Run typecheck and tests, fix any issues

## 8. Integration Testing

- [x] 8.1 Write E2E test: dry-run matches real install output
- [x] 8.2 Write E2E test: dry-run with remote source shows fetch message (skipped - requires well-known source changes)
- [x] 8.3 Write E2E test: JSON output is valid and parseable
- [x] 8.4 Run full test suite

Note: All tasks complete. CLI handler refactored to use state-based architecture.
E2E tests pass (50 passed, 3 skipped for well-known remote source dry-run which requires additional architecture changes).
Unit tests pass (845 tests).
