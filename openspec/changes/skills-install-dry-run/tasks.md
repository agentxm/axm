# Implementation Tasks

## 1. State Types

- [ ] 1.1 Create `packages/core/src/experimental/skills/state/` directory structure
- [ ] 1.2 Write tests for state type constructors and schemas
- [ ] 1.3 Implement `types.ts`: ActualSkill, LockedSkill, SkillState, SkillValidity types
- [ ] 1.4 Implement `types.ts`: IdealSkill, SkillSource, SkillChange types
- [ ] 1.5 Implement `types.ts`: SkillsDiff, DiffSummary types
- [ ] 1.6 Implement schemas for JSON serialization (--json output)
- [ ] 1.7 Run typecheck and tests, fix any issues
- [ ] 1.8 Kill any runaway vitest worker processes

## 2. State Loading

- [ ] 2.1 Write tests for loadActualSkills (disk scanning)
- [ ] 2.2 Implement loadActualSkills in `load.ts`
- [ ] 2.3 Run typecheck and tests, fix any issues
- [ ] 2.4 Kill any runaway vitest worker processes
- [ ] 2.5 Write tests for loadLockedSkills (lockfile parsing)
- [ ] 2.6 Implement loadLockedSkills in `load.ts`
- [ ] 2.7 Run typecheck and tests, fix any issues
- [ ] 2.8 Kill any runaway vitest worker processes
- [ ] 2.9 Write tests for computeValidity (actual vs locked comparison)
- [ ] 2.10 Implement computeValidity in `load.ts`
- [ ] 2.11 Run typecheck and tests, fix any issues
- [ ] 2.12 Kill any runaway vitest worker processes
- [ ] 2.13 Write tests for loadSkillsState (merge actual + locked)
- [ ] 2.14 Implement loadSkillsState in `load.ts`
- [ ] 2.15 Run typecheck and tests, fix any issues
- [ ] 2.16 Kill any runaway vitest worker processes

## 3. Ideal State Builders

- [ ] 3.1 Write tests for buildIdealForInstall
- [ ] 3.2 Implement buildIdealForInstall in `ideal.ts`
- [ ] 3.3 Run typecheck and tests, fix any issues
- [ ] 3.4 Kill any runaway vitest worker processes

## 4. Diff Computation

- [ ] 4.1 Write tests for computeDiff (Add, Update, Remove, Unchanged, Repair cases)
- [ ] 4.2 Implement computeDiff in `diff.ts`
- [ ] 4.3 Write tests for hasChanges helper
- [ ] 4.4 Implement hasChanges in `diff.ts`
- [ ] 4.5 Run typecheck and tests, fix any issues
- [ ] 4.6 Kill any runaway vitest worker processes

## 5. Apply Logic

- [ ] 5.1 Write tests for applyAdd (fetch, copy, sync agents)
- [ ] 5.2 Implement applyAdd in `apply.ts`
- [ ] 5.3 Run typecheck and tests, fix any issues
- [ ] 5.4 Kill any runaway vitest worker processes
- [ ] 5.5 Write tests for applyRemove (delete files, update state)
- [ ] 5.6 Implement applyRemove in `apply.ts`
- [ ] 5.7 Run typecheck and tests, fix any issues
- [ ] 5.8 Kill any runaway vitest worker processes
- [ ] 5.9 Write tests for applyUpdate (replace files, re-sync)
- [ ] 5.10 Implement applyUpdate in `apply.ts`
- [ ] 5.11 Run typecheck and tests, fix any issues
- [ ] 5.12 Kill any runaway vitest worker processes
- [ ] 5.13 Write tests for applyDiff (full apply with progress events)
- [ ] 5.14 Implement applyDiff with checkpoint/rollback in `apply.ts`
- [ ] 5.15 Run typecheck and tests, fix any issues
- [ ] 5.16 Kill any runaway vitest worker processes

## 6. Module Export

- [ ] 6.1 Create `index.ts` barrel file for skills/state module
- [ ] 6.2 Run typecheck and tests, fix any issues
- [ ] 6.3 Kill any runaway vitest worker processes

## 7. CLI Handler Refactor

- [ ] 7.1 Add `--dry-run` and `--json` flags to skills install command definition
- [ ] 7.2 Write E2E tests for dry-run behavior (shows plan, no changes)
- [ ] 7.3 Write E2E tests for JSON output format
- [ ] 7.4 Refactor handler to use state-based architecture (load → build ideal → diff → display/apply)
- [ ] 7.5 Implement plan display formatting (symbols, summary)
- [ ] 7.6 Run typecheck and tests, fix any issues
- [ ] 7.7 Kill any runaway vitest worker processes

## 8. Integration Testing

- [ ] 8.1 Write E2E test: dry-run matches real install output
- [ ] 8.2 Write E2E test: dry-run with remote source shows fetch message
- [ ] 8.3 Write E2E test: JSON output is valid and parseable
- [ ] 8.4 Run full test suite
- [ ] 8.5 Kill any runaway vitest worker processes
