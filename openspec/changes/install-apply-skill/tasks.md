## 1. Pure Utility Functions

- [ ] 1.1 Write tests for `sanitizeName` (lowercase, special chars, collapse, strip, truncate, empty fallback)
- [ ] 1.2 Implement `sanitizeName` in `cli-commands/skills/sanitize-name.ts`
- [ ] 1.3 Write tests for `isPathSafe` (within base, equals base, traversal, sibling, prefix false positive)
- [ ] 1.4 Implement `isPathSafe` in `utils/path-safety.ts`
- [ ] 1.5 Write tests for `sourceToLockEntry` (all 7 source variants, Option→undefined, common metadata)
- [ ] 1.6 Implement `sourceToLockEntry` in `cli-commands/skills/source-to-lock-entry.ts`
- [ ] 1.7 Run `pnpm typecheck`, fix any errors
- [ ] 1.8 Run `pnpm lint`, fix any errors
- [ ] 1.9 Run `pnpm test`, fix any failures
- [ ] 1.10 Run `pnpm test:e2e`, fix any failures
- [ ] 1.11 Kill any vitest worker processes

## 2. Filesystem Utilities

- [ ] 2.1 Write tests for `resolveParentSymlinks` (symlink parent, real parent, final component preserved)
- [ ] 2.2 Implement `resolveParentSymlinks` in `utils/resolve-parent-symlinks.ts`
- [ ] 2.3 Write tests for `createSymlink` (new, existing correct, existing wrong, directory replace, ELOOP, self-reference, relative path)
- [ ] 2.4 Implement `createSymlink` in `utils/create-symlink.ts`
- [ ] 2.5 Write tests for `copySkillDirectory` (exclusions, dereference, recursive, concurrent, destination created)
- [ ] 2.6 Implement `copySkillDirectory` in `cli-commands/skills/copy-skill-directory.ts`
- [ ] 2.7 Run `pnpm typecheck`, fix any errors
- [ ] 2.8 Run `pnpm lint`, fix any errors
- [ ] 2.9 Run `pnpm test`, fix any failures
- [ ] 2.10 Run `pnpm test:e2e`, fix any failures
- [ ] 2.11 Kill any vitest worker processes

## 3. Executor Registry on applyPlan and resolvePlan

- [ ] 3.1 Define `Executors<Op, E, R>` mapped type in `workspace/plan.ts`
- [ ] 3.2 Update `applyPlan` signature to accept `executors` registry, dispatch by `_tag`
- [ ] 3.3 Update `applyPlan` tests (executor dispatch, skip no-op, exhaustive registry)
- [ ] 3.4 Update `resolvePlan` on `WorkspaceContextService` to accept and forward `executors`
- [ ] 3.5 Update `resolvePlan` tests (executor registry forwarded to applyPlan)
- [ ] 3.6 Run `pnpm typecheck`, fix any errors
- [ ] 3.7 Run `pnpm lint`, fix any errors
- [ ] 3.8 Run `pnpm test`, fix any failures
- [ ] 3.9 Run `pnpm test:e2e`, fix any failures
- [ ] 3.10 Kill any vitest worker processes

## 4. InstallResult Type and executeAddSkill Orchestrator

- [ ] 4.1 Define `InstallResult` type in `cli-commands/skills/install/install-result.ts`
- [ ] 4.2 Write tests for `executeAddSkill` (sanitize, path safety, copy, symlink per agent, self-reference skip, symlink fallback, lockfile update, lockfile failure swallowed)
- [ ] 4.3 Implement `executeAddSkill` in `cli-commands/skills/install/execute.ts`
- [ ] 4.4 Run `pnpm typecheck`, fix any errors
- [ ] 4.5 Run `pnpm lint`, fix any errors
- [ ] 4.6 Run `pnpm test`, fix any failures
- [ ] 4.7 Run `pnpm test:e2e`, fix any failures
- [ ] 4.8 Kill any vitest worker processes

## 5. Wire Handler and Update Build Plan Concurrency

- [ ] 5.1 Change `buildPlan` job concurrency from `"unbounded"` to `1`
- [ ] 5.2 Update `buildPlan` tests for concurrency change
- [ ] 5.3 Update install handler to pass `{ "add-skill": (op) => executeAddSkill(op) }` to `ws.resolvePlan`
- [ ] 5.4 Update install handler tests for executor registry usage
- [ ] 5.5 Update barrel exports (`cli-commands/skills/index.ts`, `utils/index.ts`)
- [ ] 5.6 Run `pnpm typecheck`, fix any errors
- [ ] 5.7 Run `pnpm lint`, fix any errors
- [ ] 5.8 Run `pnpm test`, fix any failures
- [ ] 5.9 Run `pnpm test:e2e`, fix any failures
- [ ] 5.10 Kill any vitest worker processes
