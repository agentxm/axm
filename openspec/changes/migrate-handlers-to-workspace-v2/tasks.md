## 1. Export buildPlan from skills/state

- [ ] 1.1 Export `buildPlan` from `skills/state/index.ts`
- [ ] 1.2 Export related types (`CurrentStateNew`, `IdealStateNew`, `SkillSourceNew`, `LockedSkillNew`, `IdealSkillNew`) from `skills/state/index.ts`
- [ ] 1.3 Run `pnpm typecheck` and fix any errors
- [ ] 1.4 Run `pnpm lint` and fix any errors

## 2. Create workspace barrel file and plan utilities

- [ ] 2.1 Create `workspace/index.ts` barrel file exporting context, load-state, ideal-state, apply modules
- [ ] 2.2 Write tests for `buildPlanFromState` adapter function in `workspace/plan.test.ts`
- [ ] 2.3 Create `workspace/plan.ts` with `buildPlanFromState` that adapts V2 types to pure-function types
- [ ] 2.4 Extract `getPlanSummary` from `formatSummary` in apply.ts and export it
- [ ] 2.5 Add `planToJson(plan: Plan): PlanJson` function for `--json` flag support
- [ ] 2.6 Export new functions from `workspace/index.ts`
- [ ] 2.7 Run `pnpm typecheck` and fix any errors
- [ ] 2.8 Run `pnpm lint` and fix any errors
- [ ] 2.9 Run `pnpm test packages/core/src/experimental/workspace/` and fix any failures
- [ ] 2.10 Kill any vitest worker processes

## 3. Migrate install handler

- [ ] 3.1 Update imports in `install/handler.ts` to use workspace module (`loadCurrentState`, `buildIdealState`, `buildPlanFromState`, `applyPlan`, `planToJson`, `getPlanSummary`)
- [ ] 3.2 Remove legacy imports (`loadSkillsState`, `buildIdealForInstall`, `computeDiff`, `applyDiff`, `skillsDiffToJson`)
- [ ] 3.3 Update handler logic to use V2 pipeline: load → ideal → plan → apply
- [ ] 3.4 Update type mappings for `InstallCommand` creation
- [ ] 3.5 Replace `displayDiff` with `displayPlan` from workspace
- [ ] 3.6 Replace `outputDiffJson` with `planToJson` for `--json` flag support
- [ ] 3.7 Replace `diff.summary.add` counts with `getPlanSummary(plan)`
- [ ] 3.8 Replace `hasChanges(diff)` with `plan.steps.length > 0`
- [ ] 3.9 Update handler tests in `install/handler.test.ts` with new mock structure
- [ ] 3.10 Run `pnpm typecheck` and fix any errors
- [ ] 3.11 Run `pnpm lint` and fix any errors
- [ ] 3.12 Run `pnpm test packages/cli/src/commands/skills/install/` and fix any failures
- [ ] 3.13 Run `pnpm test:e2e -- --grep install` and fix any failures
- [ ] 3.14 Kill any vitest worker processes

## 4. Migrate uninstall handler

- [ ] 4.1 Update imports in `uninstall/handler.ts` to use workspace module
- [ ] 4.2 Remove legacy imports (`loadSkillsState`, `buildIdealForUninstall`, `computeDiff`, `applyDiff`)
- [ ] 4.3 Replace dynamic import (line 362-364) with static imports for `readLockfile`, `updateLockEntry`
- [ ] 4.4 Update handler logic to use V2 pipeline
- [ ] 4.5 Refactor `handlePartialUninstall` to construct `Plan` with targeted steps and use `applyPlan`
- [ ] 4.6 Replace `displayPlanFromDiff` with `displayPlan` from workspace
- [ ] 4.7 Replace `outputPlanJson` with `planToJson` for `--json` flag support
- [ ] 4.8 Replace `hasChanges(diff)` with `plan.steps.length > 0`
- [ ] 4.9 Update handler tests in `uninstall/handler.test.ts` with new mock structure
- [ ] 4.10 Run `pnpm typecheck` and fix any errors
- [ ] 4.11 Run `pnpm lint` and fix any errors
- [ ] 4.12 Run `pnpm test packages/cli/src/commands/skills/uninstall/` and fix any failures
- [ ] 4.13 Run `pnpm test:e2e -- --grep uninstall` and fix any failures
- [ ] 4.14 Kill any vitest worker processes

## 5. Delete legacy modules

_Deleting ideal.ts also removes dead code: `buildIdealForSync`, `buildIdealForUpdate`, `buildIdealForUninstallV2` (only had tests, never called from CLI)._

- [ ] 5.1 Delete `skills/state/apply.ts`
- [ ] 5.2 Delete `skills/state/apply.test.ts`
- [ ] 5.3 Delete `skills/state/load.ts`
- [ ] 5.4 Delete `skills/state/load.test.ts`
- [ ] 5.5 Delete `skills/state/ideal.ts`
- [ ] 5.6 Delete `skills/state/ideal.test.ts`
- [ ] 5.7 Delete `skills/state/diff.ts`
- [ ] 5.8 Delete `skills/state/diff.test.ts`
- [ ] 5.9 Run `pnpm typecheck` and fix any errors
- [ ] 5.10 Run `pnpm lint` and fix any errors
- [ ] 5.11 Kill any vitest worker processes

## 6. Update exports

- [ ] 6.1 Update `skills/state/index.ts` to remove deleted module exports
- [ ] 6.2 Update `skills/index.ts` to remove re-exports from deleted modules
- [ ] 6.3 Run `pnpm typecheck` and fix any errors
- [ ] 6.4 Run `pnpm lint` and fix any errors
- [ ] 6.5 Run `pnpm test` and fix any failures
- [ ] 6.6 Kill any vitest worker processes

## 7. Final verification

- [ ] 7.1 Run `pnpm typecheck` - full project type check
- [ ] 7.2 Run `pnpm lint` - full project lint
- [ ] 7.3 Run `pnpm test` - full test suite
- [ ] 7.4 Run `pnpm test:e2e` - full E2E suite
- [ ] 7.5 Kill any vitest worker processes
