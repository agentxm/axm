## 1. Fix Local Source Format in apply.ts

- [ ] 1.1 Update test for `sourceToSettingsValue` to expect plain path (no `local:` prefix)
- [ ] 1.2 Modify `sourceToSettingsValue` to return `source.path` for Local sources
- [ ] 1.3 Run typecheck for all packages (`pnpm typecheck`), fix any errors
- [ ] 1.4 Run linting for all packages (`pnpm lint`), fix any errors
- [ ] 1.5 Run tests for all packages (`pnpm test`), fix any failures
- [ ] 1.6 Kill vitest worker processes

## 2. Update Install Handler

- [ ] 2.1 Add test case verifying install handler uses `applyDiff` (not direct manipulation)
- [ ] 2.2 Add import for `applyDiff` and `ApplyResult` from state module
- [ ] 2.3 Replace `installSkillsFromFileSystem` call with `applyDiff(diff, { axmDir, agents })`
- [ ] 2.4 Update result display logic to use `ApplyResult` instead of `InstallResult[]`
- [ ] 2.5 Delete `createLockEntryFromParsed` function
- [ ] 2.6 Delete `installSingleSkillFromFileSystem` function
- [ ] 2.7 Delete `installSkillsFromFileSystem` function
- [ ] 2.8 Remove unused imports (`updateLockEntry`, `updateSettings`, etc.)
- [ ] 2.9 Run typecheck for all packages (`pnpm typecheck`), fix any errors
- [ ] 2.10 Run linting for all packages (`pnpm lint`), fix any errors
- [ ] 2.11 Run tests for all packages (`pnpm test`), fix any failures
- [ ] 2.12 Kill vitest worker processes

## 3. Update Uninstall Handler

- [ ] 3.1 Add test case verifying uninstall handler uses state-based pattern
- [ ] 3.2 Add imports for `loadSkillsState`, `buildIdealForUninstall`, `computeDiff`, `applyDiff`
- [ ] 3.3 Replace direct `readLockfile` with `loadSkillsState`
- [ ] 3.4 Add `buildIdealForUninstall` call to compute ideal state
- [ ] 3.5 Add `computeDiff` call to generate the plan
- [ ] 3.6 Replace direct file/settings/lockfile manipulation with `applyDiff`
- [ ] 3.7 Update plan display to use diff structure
- [ ] 3.8 Remove unused imports (`readLockfile`, `removeLockEntry`, `removeSkillFromAgents`, `updateLockEntry`, `updateSettings`)
- [ ] 3.9 Run typecheck for all packages (`pnpm typecheck`), fix any errors
- [ ] 3.10 Run linting for all packages (`pnpm lint`), fix any errors
- [ ] 3.11 Run tests for all packages (`pnpm test`), fix any failures
- [ ] 3.12 Kill vitest worker processes

## 4. Final Verification

- [ ] 4.1 Run full test suite (`pnpm test`)
- [ ] 4.2 Run E2E tests (`pnpm test:e2e`)
- [ ] 4.3 Manual verification: install skill from local source, check settings/lockfile
- [ ] 4.4 Manual verification: uninstall skill, check settings/lockfile updated correctly
- [ ] 4.5 Kill vitest worker processes
