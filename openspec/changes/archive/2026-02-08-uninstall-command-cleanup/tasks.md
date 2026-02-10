## 1. Convention Fixes (type renames, redundant assertions)

- [x] 1.1 Rename `UninstallArgs` to `UninstallCommandArgs` in `command.ts`
- [x] 1.2 Rename `UninstallArgs` to `UninstallHandlerArgs` in `handler.ts`, update import in `handler.test.ts`
- [x] 1.3 Remove redundant `as const` assertions on `"PlannedJobStep"`, `"success"`, and `"no-op"` literals in `build-plan.ts`
- [x] 1.4 Remove redundant `ReadonlyArray<UninstallSkillOperation>` type annotation on `ops` in `handler.ts`
- [x] 1.5 Run `pnpm typecheck` and fix any errors
- [x] 1.6 Run `pnpm lint` and fix any errors
- [x] 1.7 Run `pnpm test` and fix any failures
- [x] 1.8 Run `pnpm test:e2e` and fix any failures
- [x] 1.9 Kill any vitest worker processes

## 2. Narrow executor lockfile read error handling

- [x] 2.1 Add test: corrupt lockfile (`LockfileParseError`) propagates instead of falling back to empty lockfile
- [x] 2.2 Add test: missing lockfile (`LockfileNotFoundError`) still falls back to empty lockfile
- [x] 2.3 Replace `catchAll` on `getLockfile()` in `uninstall-skill.ts` with `catchTag("LockfileNotFoundError", ...)` — let `LockfileParseError` propagate
- [x] 2.4 Run `pnpm typecheck` and fix any errors
- [x] 2.5 Run `pnpm lint` and fix any errors
- [x] 2.6 Run `pnpm test` and fix any failures
- [x] 2.7 Run `pnpm test:e2e` and fix any failures
- [x] 2.8 Kill any vitest worker processes

## 3. Propagate lockfile write errors

- [x] 3.1 Add test: `updateLockEntry` failure during partial uninstall propagates as error
- [x] 3.2 Add test: `removeLockEntry` failure during full uninstall propagates as error
- [x] 3.3 Remove `catchAll` on `updateLockEntry` call in `uninstall-skill.ts` — let `LockfileError` propagate
- [x] 3.4 Remove `catchAll` on `removeLockEntry` call in `uninstall-skill.ts` — let `LockfileError` propagate
- [x] 3.5 Run `pnpm typecheck` and fix any errors
- [x] 3.6 Run `pnpm lint` and fix any errors
- [x] 3.7 Run `pnpm test` and fix any failures
- [x] 3.8 Run `pnpm test:e2e` and fix any failures
- [x] 3.9 Kill any vitest worker processes
