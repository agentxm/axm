## 1. LockfileService — Service and Tests

- [x] 1.1 Write tests for `LockfileService` in `packages/cli/src/lockfile/service.test.ts` covering: `getSkills`, `getEntry`, `updateEntry`, `removeEntry`, auto-creation, concurrent mutation serialization, and `Option` return for `getEntry`
- [x] 1.2 Implement `LockfileService` interface, `Context.Tag`, and `LockfileServiceLive` layer in `packages/cli/src/lockfile/service.ts` — follow `SettingsService` pattern (Semaphore(1), Workspace dependency, readOrCreate helper)
- [x] 1.3 Run typecheck (`pnpm typecheck`), fix any errors
- [x] 1.4 Run tests (`pnpm test`), fix any failures
- [x] 1.5 Run linting (`pnpm lint`), fix any errors
- [x] 1.6 Kill any vitest worker processes

## 2. Update Lockfile Barrel Exports

- [x] 2.1 Update `packages/cli/src/lockfile/index.ts`: add `LockfileService`, `LockfileServiceLive` exports; remove `readLockfile`, `writeLockfile`, `updateLockEntry`, `removeLockEntry` from barrel
- [x] 2.2 Run typecheck (`pnpm typecheck`), fix any errors
- [x] 2.3 Run tests (`pnpm test`), fix any failures
- [x] 2.4 Run linting (`pnpm lint`), fix any errors
- [x] 2.5 Kill any vitest worker processes

## 3. Migrate Install Executor

- [x] 3.1 Update tests in `packages/cli/src/cli-commands/skills/install/install-skill.test.ts` to provide `LockfileService` mock layer instead of raw `FileSystem` for lockfile writes
- [x] 3.2 Update `packages/cli/src/cli-commands/skills/install/install-skill.ts` to use `LockfileService.updateEntry()` instead of standalone `updateLockEntry(axmDir, ...)`
- [x] 3.3 Run typecheck (`pnpm typecheck`), fix any errors
- [x] 3.4 Run tests (`pnpm test`), fix any failures
- [x] 3.5 Run linting (`pnpm lint`), fix any errors
- [x] 3.6 Kill any vitest worker processes

## 4. Migrate Uninstall Executor

- [x] 4.1 Update tests in `packages/cli/src/cli-commands/skills/uninstall/uninstall-skill.test.ts` to provide `LockfileService` mock layer instead of raw functions and `ws.getLockfile()`
- [x] 4.2 Update `packages/cli/src/cli-commands/skills/uninstall/uninstall-skill.ts` to use `LockfileService.getEntry()`, `LockfileService.updateEntry()`, and `LockfileService.removeEntry()` instead of standalone functions and `ws.getLockfile()`
- [x] 4.3 Run typecheck (`pnpm typecheck`), fix any errors
- [x] 4.4 Run tests (`pnpm test`), fix any failures
- [x] 4.5 Run linting (`pnpm lint`), fix any errors
- [x] 4.6 Kill any vitest worker processes

## 5. Migrate Install and Uninstall Handlers

- [x] 5.1 Update tests in `packages/cli/src/cli-commands/skills/install/handler.test.ts` to provide `LockfileService` mock layer instead of `ws.getLockfile()`
- [x] 5.2 Update `packages/cli/src/cli-commands/skills/install/handler.ts` to read lockfile via `LockfileService.getSkills()` instead of `ws.getLockfile()`
- [x] 5.3 Update tests in `packages/cli/src/cli-commands/skills/uninstall/handler.test.ts` to provide `LockfileService` mock layer instead of `ws.getLockfile()`
- [x] 5.4 Update `packages/cli/src/cli-commands/skills/uninstall/handler.ts` to read lockfile via `LockfileService.getSkills()` instead of `ws.getLockfile()`
- [x] 5.5 Run typecheck (`pnpm typecheck`), fix any errors
- [x] 5.6 Run tests (`pnpm test`), fix any failures
- [x] 5.7 Run linting (`pnpm lint`), fix any errors
- [x] 5.8 Kill any vitest worker processes

## 6. Remove getLockfile from WorkspaceContextService

- [x] 6.1 Update tests that mock `WorkspaceContextService` (settings service tests, ensure-agents tests, etc.) to remove `getLockfile` from mock objects
- [x] 6.2 Remove `getLockfile` from `WorkspaceContextService` interface and its implementation in `packages/cli/src/workspace/service.ts`
- [x] 6.3 Run typecheck (`pnpm typecheck`), fix any errors
- [x] 6.4 Run tests (`pnpm test`), fix any failures
- [x] 6.5 Run linting (`pnpm lint`), fix any errors
- [x] 6.6 Run e2e tests (`pnpm test:e2e`), fix any failures
- [x] 6.7 Kill any vitest worker processes

## 7. Final Verification

- [x] 7.1 Run full typecheck (`pnpm typecheck`)
- [x] 7.2 Run full test suite (`pnpm test`)
- [x] 7.3 Run full linting (`pnpm lint`)
- [x] 7.4 Run e2e tests (`pnpm test:e2e`)
- [x] 7.5 Kill any vitest worker processes
