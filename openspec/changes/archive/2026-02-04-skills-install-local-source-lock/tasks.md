## 1. Fix Local Source Format in apply.ts

- [x] 1.1 Update test for `sourceToSettingsValue` to expect plain path (no `local:` prefix)
- [x] 1.2 Modify `sourceToSettingsValue` to return `source.path` for Local sources
- [x] 1.3 Run typecheck for all packages (`pnpm typecheck`), fix any errors
- [x] 1.4 Run linting for all packages (`pnpm lint`), fix any errors
- [x] 1.5 Run tests for all packages (`pnpm test`), fix any failures (core tests pass; handler tests fail pending Group 2)
- [x] 1.6 Kill vitest worker processes

## 2. Update Install Handler

- [x] 2.1 Add test case verifying install handler uses `applyDiff` (not direct manipulation)
- [x] 2.2 Add import for `applyDiff` and `ApplyResult` from state module
- [x] 2.3 Replace `installSkillsFromFileSystem` call with `applyDiff(diff, { axmDir, agents })`
- [x] 2.4 Update result display logic to use `ApplyResult` instead of `InstallResult[]`
- [x] 2.5 Delete `createLockEntryFromParsed` function
- [x] 2.6 Delete `installSingleSkillFromFileSystem` function
- [x] 2.7 Delete `installSkillsFromFileSystem` function
- [x] 2.8 Remove unused imports (`updateLockEntry`, `updateSettings`, etc.)
- [x] 2.9 Run typecheck for all packages (`pnpm typecheck`), fix any errors
- [x] 2.10 Run linting for all packages (`pnpm lint`), fix any errors
- [x] 2.11 Run tests for all packages (`pnpm test`), fix any failures
- [x] 2.12 Kill vitest worker processes

## 3. Update Uninstall Handler

- [x] 3.1 Add test case verifying uninstall handler uses state-based pattern
- [x] 3.2 Add imports for `loadSkillsState`, `buildIdealForUninstall`, `computeDiff`, `applyDiff`
- [x] 3.3 Replace direct `readLockfile` with `loadSkillsState`
- [x] 3.4 Add `buildIdealForUninstall` call to compute ideal state
- [x] 3.5 Add `computeDiff` call to generate the plan
- [x] 3.6 Replace direct file/settings/lockfile manipulation with `applyDiff`
- [x] 3.7 Update plan display to use diff structure
- [x] 3.8 Remove unused imports (`readLockfile`, `removeLockEntry`, `removeSkillFromAgents`, `updateLockEntry`, `updateSettings`)
- [x] 3.9 Run typecheck for all packages (`pnpm typecheck`), fix any errors
- [x] 3.10 Run linting for all packages (`pnpm lint`), fix any errors
- [x] 3.11 Run tests for all packages (`pnpm test`), fix any failures (uninstall tests pass; install tests fail pending Group 2)
- [x] 3.12 Kill vitest worker processes

## 4. Final Verification

- [x] 4.1 Run full test suite (`pnpm test`)
- [x] 4.2 Run E2E tests (`pnpm test:e2e`)
- [x] 4.3 Manual verification: install skill from local source, check settings/lockfile
- [x] 4.4 Manual verification: uninstall skill, check settings/lockfile updated correctly
- [x] 4.5 Kill vitest worker processes
