## 1. LockfileService — Service and Tests

- [ ] 1.1 Write tests for `LockfileService` in `packages/cli/src/lockfile/service.test.ts` covering: `getSkills`, `getEntry`, `updateEntry`, `removeEntry`, auto-creation, concurrent mutation serialization, and `Option` return for `getEntry`
- [ ] 1.2 Implement `LockfileService` interface, `Context.Tag`, and `LockfileServiceLive` layer in `packages/cli/src/lockfile/service.ts` — follow `SettingsService` pattern (Semaphore(1), Workspace dependency, readOrCreate helper)
- [ ] 1.3 Run typecheck (`pnpm typecheck`), fix any errors
- [ ] 1.4 Run tests (`pnpm test`), fix any failures
- [ ] 1.5 Run linting (`pnpm lint`), fix any errors
- [ ] 1.6 Kill any vitest worker processes

## 2. Update Lockfile Barrel Exports

- [ ] 2.1 Update `packages/cli/src/lockfile/index.ts`: add `LockfileService`, `LockfileServiceLive` exports; remove `readLockfile`, `writeLockfile`, `updateLockEntry`, `removeLockEntry` from barrel
- [ ] 2.2 Run typecheck (`pnpm typecheck`), fix any errors
- [ ] 2.3 Run tests (`pnpm test`), fix any failures
- [ ] 2.4 Run linting (`pnpm lint`), fix any errors
- [ ] 2.5 Kill any vitest worker processes

## 3. Migrate Install Executor

- [ ] 3.1 Update tests in `packages/cli/src/cli-commands/skills/install/install-skill.test.ts` to provide `LockfileService` mock layer instead of raw `FileSystem` for lockfile writes
- [ ] 3.2 Update `packages/cli/src/cli-commands/skills/install/install-skill.ts` to use `LockfileService.updateEntry()` instead of standalone `updateLockEntry(axmDir, ...)`
- [ ] 3.3 Run typecheck (`pnpm typecheck`), fix any errors
- [ ] 3.4 Run tests (`pnpm test`), fix any failures
- [ ] 3.5 Run linting (`pnpm lint`), fix any errors
- [ ] 3.6 Kill any vitest worker processes

## 4. Migrate Uninstall Executor

- [ ] 4.1 Update tests in `packages/cli/src/cli-commands/skills/uninstall/uninstall-skill.test.ts` to provide `LockfileService` mock layer instead of raw functions and `ws.getLockfile()`
- [ ] 4.2 Update `packages/cli/src/cli-commands/skills/uninstall/uninstall-skill.ts` to use `LockfileService.getEntry()`, `LockfileService.updateEntry()`, and `LockfileService.removeEntry()` instead of standalone functions and `ws.getLockfile()`
- [ ] 4.3 Run typecheck (`pnpm typecheck`), fix any errors
- [ ] 4.4 Run tests (`pnpm test`), fix any failures
- [ ] 4.5 Run linting (`pnpm lint`), fix any errors
- [ ] 4.6 Kill any vitest worker processes

## 5. Migrate Install and Uninstall Handlers

- [ ] 5.1 Update tests in `packages/cli/src/cli-commands/skills/install/handler.test.ts` to provide `LockfileService` mock layer instead of `ws.getLockfile()`
- [ ] 5.2 Update `packages/cli/src/cli-commands/skills/install/handler.ts` to read lockfile via `LockfileService.getSkills()` instead of `ws.getLockfile()`
- [ ] 5.3 Update tests in `packages/cli/src/cli-commands/skills/uninstall/handler.test.ts` to provide `LockfileService` mock layer instead of `ws.getLockfile()`
- [ ] 5.4 Update `packages/cli/src/cli-commands/skills/uninstall/handler.ts` to read lockfile via `LockfileService.getSkills()` instead of `ws.getLockfile()`
- [ ] 5.5 Run typecheck (`pnpm typecheck`), fix any errors
- [ ] 5.6 Run tests (`pnpm test`), fix any failures
- [ ] 5.7 Run linting (`pnpm lint`), fix any errors
- [ ] 5.8 Kill any vitest worker processes

## 6. Remove getLockfile from WorkspaceContextService

- [ ] 6.1 Update tests that mock `WorkspaceContextService` (settings service tests, ensure-agents tests, etc.) to remove `getLockfile` from mock objects
- [ ] 6.2 Remove `getLockfile` from `WorkspaceContextService` interface and its implementation in `packages/cli/src/workspace/service.ts`
- [ ] 6.3 Run typecheck (`pnpm typecheck`), fix any errors
- [ ] 6.4 Run tests (`pnpm test`), fix any failures
- [ ] 6.5 Run linting (`pnpm lint`), fix any errors
- [ ] 6.6 Run e2e tests (`pnpm test:e2e`), fix any failures
- [ ] 6.7 Kill any vitest worker processes

## 7. Final Verification

- [ ] 7.1 Run full typecheck (`pnpm typecheck`)
- [ ] 7.2 Run full test suite (`pnpm test`)
- [ ] 7.3 Run full linting (`pnpm lint`)
- [ ] 7.4 Run e2e tests (`pnpm test:e2e`)
- [ ] 7.5 Kill any vitest worker processes
