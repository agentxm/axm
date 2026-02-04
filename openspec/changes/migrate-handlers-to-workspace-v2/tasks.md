## 1. Create workspace/plan.ts with buildPlan using V2 types

- [x] 1.1 Create `workspace/plan.ts` with `buildPlan(current: CurrentState, ideal: IdealState): Plan` using V2 types from `types.ts`
- [x] 1.2 Port tests from `pure-functions.test.ts` (buildPlan tests only) to `workspace/plan.test.ts`
- [x] 1.3 Add `planHasChanges(plan: Plan): boolean` utility function
- [x] 1.4 Add `getPlanSummary(plan: Plan): PlanSummary` (extract from `formatSummary` in apply.ts)
- [x] 1.5 Add `planToJson(plan: Plan): PlanJson` for `--json` flag support
- [x] 1.6 Run `pnpm typecheck` and fix any errors
- [x] 1.7 Run `pnpm test packages/core/src/experimental/workspace/` and fix any failures

## 2. Create workspace barrel file

- [x] 2.1 Create `workspace/index.ts` barrel file
- [x] 2.2 Export: `WorkspaceContext`, `loadCurrentState`, `buildIdealState`, `buildIdealForInstall`, `buildIdealForUninstall`, `buildPlan`, `planHasChanges`, `applyPlan`, `displayPlan`, `planToJson`, `getPlanSummary`
- [x] 2.3 Run `pnpm typecheck` and fix any errors

## 3. Migrate install handler

- [x] 3.1 Update imports in `install/handler.ts` to use workspace module
- [x] 3.2 Remove legacy imports (`loadSkillsState`, `buildIdealForInstall`, `computeDiff`, `applyDiff`, `skillsDiffToJson`, `hasChanges`)
- [x] 3.3 Replace `loadSkillsState` with `loadCurrentState`
- [x] 3.4 Replace `buildIdealForInstall` (legacy) with `buildIdealForInstall` (workspace)
- [x] 3.5 Replace `computeDiff` with `buildPlan`
- [x] 3.6 Replace `hasChanges(diff)` with `planHasChanges(plan)`
- [x] 3.7 Replace `applyDiff` with `applyPlan`
- [x] 3.8 Replace `skillsDiffToJson` with `planToJson`
- [x] 3.9 Replace `diff.summary.*` counts with `getPlanSummary(plan)`
- [x] 3.10 Update handler tests in `install/handler.test.ts` with new mock structure
- [x] 3.11 Run `pnpm typecheck` and fix any errors
- [x] 3.12 Run `pnpm test packages/cli/src/commands/skills/install/` and fix any failures
- [x] 3.13 Run `pnpm test:e2e -- --grep install` and fix any failures

## 4. Migrate uninstall handler

- [x] 4.1 Update imports in `uninstall/handler.ts` to use workspace module
- [x] 4.2 Remove legacy imports (`loadSkillsState`, `buildIdealForUninstall`, `computeDiff`, `applyDiff`, `hasChanges`)
- [x] 4.3 Replace dynamic import (line 362-364) with static imports for `readLockfile`, `updateLockEntry`
- [x] 4.4 Replace `loadSkillsState` with `loadCurrentState`
- [x] 4.5 Replace `buildIdealForUninstall` (legacy) with `buildIdealForUninstall` (workspace)
- [x] 4.6 Replace `computeDiff` with `buildPlan`
- [x] 4.7 Replace `hasChanges(diff)` with `planHasChanges(plan)`
- [x] 4.8 Replace `applyDiff` with `applyPlan`
- [x] 4.9 Refactor `handlePartialUninstall` to construct `Plan` with targeted steps and use `applyPlan`
- [x] 4.10 Update handler tests in `uninstall/handler.test.ts` with new mock structure
- [x] 4.11 Run `pnpm typecheck` and fix any errors
- [x] 4.12 Run `pnpm test packages/cli/src/commands/skills/uninstall/` and fix any failures
- [x] 4.13 Run `pnpm test:e2e -- --grep uninstall` and fix any failures

## 5. Clean up pure-functions.ts

- [x] 5.1 Delete `*New` types: `CurrentStateNew`, `SkillStateNew`, `ActualSkillNew`, `IdealStateNew`, `IdealSkillNew`, `LockedSkillNew`, `SkillSourceNew`
- [x] 5.2 Delete `PlanStep` and `Plan` types (duplicates of types.ts)
- [x] 5.3 Delete `buildPlan` function (replaced by workspace version)
- [x] 5.4 Delete `toSettingsEntry` function and `SkillSettingsEntry` type (dead code - workspace has `sourceV2ToSettingsValue`)
- [x] 5.5 Delete `collectIssues` function (dead code - only had tests, never imported in production)
- [x] 5.6 Delete tests for removed code from `pure-functions.test.ts` (keep `computeInstallPath` and `versionsEqual` tests)
- [x] 5.7 Run `pnpm typecheck` and fix any errors

## 6. Delete legacy modules

_Deleting ideal.ts also removes dead code: `buildIdealForSync`, `buildIdealForUpdate`, `buildIdealForUninstallV2` (only had tests, never called from CLI)._

- [ ] 6.1 Delete `skills/state/apply.ts` and `skills/state/apply.test.ts`
- [ ] 6.2 Delete `skills/state/load.ts` and `skills/state/load.test.ts`
- [ ] 6.3 Delete `skills/state/ideal.ts` and `skills/state/ideal.test.ts`
- [ ] 6.4 Delete `skills/state/diff.ts` and `skills/state/diff.test.ts`
- [ ] 6.5 Run `pnpm typecheck` and fix any errors

## 7. Update exports

- [ ] 7.1 Update `skills/state/index.ts` to remove deleted module exports
- [ ] 7.2 Verify no remaining imports from deleted modules across codebase
- [ ] 7.3 Run `pnpm typecheck` and fix any errors

## 8. Final verification

- [ ] 8.1 Run `pnpm typecheck` - full project type check
- [ ] 8.2 Run `pnpm lint` - full project lint
- [ ] 8.3 Run `pnpm test` - full test suite
- [ ] 8.4 Run `pnpm test:e2e` - full E2E suite
