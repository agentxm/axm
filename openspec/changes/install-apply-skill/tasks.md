## 1. Foundation Types and Operation Rename

- [ ] 1.1 Add `OperationResult`, `OperationError`, `OperationHandler`, `Handlers`, and `ExecutionContext` types to `workspace/apply-plan.ts` (or a new `workspace/operation-types.ts` if cleaner)
- [ ] 1.2 Write tests for `OperationResult` type usage and `OperationError` construction
- [ ] 1.3 Rename `AddSkillOperation._tag` from `"add-skill"` to `"install-skill"` and `RemoveSkillOperation._tag` from `"remove-skill"` to `"uninstall-skill"` in `cli-commands/skills/operations.ts`
- [ ] 1.4 Update all references to old `_tag` values across the codebase (build-plan, handler, tests, display-plan)
- [ ] 1.5 Run typecheck for all packages (`pnpm typecheck`), fix any errors
- [ ] 1.6 Run linting for all packages (`pnpm lint`), fix any errors
- [ ] 1.7 Run tests for all packages (`pnpm test`), fix any failures
- [ ] 1.8 Run relevant e2e tests (`pnpm test:e2e`), fix any failures
- [ ] 1.9 Kill any vitest worker processes

## 2. Modify `applyPlan` to Accept Executor Registry

- [ ] 2.1 Write tests for new `applyPlan` signature: dispatches to executor by `_tag`, catches `OperationError` and converts to error result, skips `"no-op"` actions, returns `ReadonlyArray<OperationResult>`
- [ ] 2.2 Implement new `applyPlan` with typed executor registry parameter, removing hardcoded Clack dependency
- [ ] 2.3 Update existing `applyPlan` tests for new signature and return type
- [ ] 2.4 Run typecheck for all packages (`pnpm typecheck`), fix any errors
- [ ] 2.5 Run linting for all packages (`pnpm lint`), fix any errors
- [ ] 2.6 Run tests for all packages (`pnpm test`), fix any failures
- [ ] 2.7 Run relevant e2e tests (`pnpm test:e2e`), fix any failures
- [ ] 2.8 Kill any vitest worker processes

## 3. Thread Executors Through `resolvePlan`

- [ ] 3.1 Write tests for `resolvePlan` accepting and forwarding executor registry to `applyPlan`
- [ ] 3.2 Update `WorkspaceContextService` interface to include `executors` parameter on `resolvePlan`
- [ ] 3.3 Update `resolvePlan` implementation in `service.ts` to accept and forward executors
- [ ] 3.4 Update return type of `resolvePlan` to `ReadonlyArray<OperationResult>`
- [ ] 3.5 Update existing `resolvePlan` tests for new signature
- [ ] 3.6 Update workspace barrel exports if needed
- [ ] 3.7 Run typecheck for all packages (`pnpm typecheck`), fix any errors
- [ ] 3.8 Run linting for all packages (`pnpm lint`), fix any errors
- [ ] 3.9 Run tests for all packages (`pnpm test`), fix any failures
- [ ] 3.10 Run relevant e2e tests (`pnpm test:e2e`), fix any failures
- [ ] 3.11 Kill any vitest worker processes

## 4. Utility Functions

- [ ] 4.1 Write tests for `isPathSafe(base, target)` in `utils/path-safety.ts` — covers traversal, boundary matching, normalized paths
- [ ] 4.2 Implement `isPathSafe` in `utils/path-safety.ts`
- [ ] 4.3 Write tests for `resolveParentSymlinks` in `utils/resolve-parent-symlinks.ts` — resolves parent through symlinks, preserves final component
- [ ] 4.4 Implement `resolveParentSymlinks` in `utils/resolve-parent-symlinks.ts`
- [ ] 4.5 Write tests for `createSymlink` in `utils/create-symlink.ts` — new symlink, correct existing no-op, wrong target replace, ELOOP recovery, self-reference skip, relative path via resolved parent
- [ ] 4.6 Implement `createSymlink` in `utils/create-symlink.ts`
- [ ] 4.7 Update `utils/index.ts` barrel to export new utilities
- [ ] 4.8 Run typecheck for all packages (`pnpm typecheck`), fix any errors
- [ ] 4.9 Run linting for all packages (`pnpm lint`), fix any errors
- [ ] 4.10 Run tests for all packages (`pnpm test`), fix any failures
- [ ] 4.11 Run relevant e2e tests (`pnpm test:e2e`), fix any failures
- [ ] 4.12 Kill any vitest worker processes

## 5. Skill-Specific Shared Functions

- [ ] 5.1 Update `sanitizeName` regex in `skill-utils.ts` to use `+` quantifier (`/[^a-z0-9._]+/g`), update or add tests for consecutive-character collapsing
- [ ] 5.2 Write tests for `copySkillDirectory` in `cli-commands/skills/copy-skill-directory.ts` — excludes README.md, metadata.json, `_`-prefixed, `.git`; dereferences symlinks; copies recursively and concurrently
- [ ] 5.3 Implement `copySkillDirectory` in `cli-commands/skills/copy-skill-directory.ts`
- [ ] 5.4 Write tests for `sourceToLockEntry` in `cli-commands/skills/source-to-lock-entry.ts` — all 7 source types, Option→undefined conversion, field renaming (subPath→path)
- [ ] 5.5 Implement `sourceToLockEntry` in `cli-commands/skills/source-to-lock-entry.ts`
- [ ] 5.6 Define `InstallResult` type in `cli-commands/skills/install/install-result.ts`
- [ ] 5.7 Update `cli-commands/skills/index.ts` barrel to export shared functions
- [ ] 5.8 Run typecheck for all packages (`pnpm typecheck`), fix any errors
- [ ] 5.9 Run linting for all packages (`pnpm lint`), fix any errors
- [ ] 5.10 Run tests for all packages (`pnpm test`), fix any failures
- [ ] 5.11 Run relevant e2e tests (`pnpm test:e2e`), fix any failures
- [ ] 5.12 Kill any vitest worker processes

## 6. Install Skill Executor

- [ ] 6.1 Write tests for `installSkill` executor in `cli-commands/skills/install/install-skill.ts` — sanitize→validate→copy→symlink→lockfile pipeline, error cases (path traversal, copy failure), symlink fallback to copy, lockfile error swallowed, per-agent `InstallResult` returned
- [ ] 6.2 Implement `installSkill` executor in `cli-commands/skills/install/install-skill.ts`
- [ ] 6.3 Run typecheck for all packages (`pnpm typecheck`), fix any errors
- [ ] 6.4 Run linting for all packages (`pnpm lint`), fix any errors
- [ ] 6.5 Run tests for all packages (`pnpm test`), fix any failures
- [ ] 6.6 Run relevant e2e tests (`pnpm test:e2e`), fix any failures
- [ ] 6.7 Kill any vitest worker processes

## 7. Wire Install Handler and Build Plan

- [ ] 7.1 Change `buildPlan` job concurrency from `"unbounded"` to `1` in `cli-commands/skills/install/build-plan.ts`, update corresponding test
- [ ] 7.2 Write tests for install handler passing executor registry to `resolvePlan`
- [ ] 7.3 Update install handler in `cli-commands/skills/install/handler.ts` to pass `{ "install-skill": installSkill }` to `ws.resolvePlan`
- [ ] 7.4 Handle returned `OperationResult[]` for result reporting in the handler
- [ ] 7.5 Run typecheck for all packages (`pnpm typecheck`), fix any errors
- [ ] 7.6 Run linting for all packages (`pnpm lint`), fix any errors
- [ ] 7.7 Run tests for all packages (`pnpm test`), fix any failures
- [ ] 7.8 Run relevant e2e tests (`pnpm test:e2e`), fix any failures
- [ ] 7.9 Kill any vitest worker processes
