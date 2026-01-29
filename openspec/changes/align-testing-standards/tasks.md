# Tasks: Align Testing Standards

## Phase 1: File Reorganization

Move core package tests from `__tests__/` to colocated files per CLI spec requirement.

- [ ] Move `agent-detection.test.ts` to colocated position
- [ ] Move `content-hash.test.ts` to colocated position
- [ ] Move `git.test.ts` to colocated position
- [ ] Move `installer.test.ts` to colocated position
- [ ] Move `lockfile.test.ts` to colocated position
- [ ] Move `settings.test.ts` to colocated position
- [ ] Move `skill-discovery.test.ts` to colocated position
- [ ] Move `source-parser.test.ts` to colocated position
- [ ] Move `wellknown.test.ts` to colocated position
- [ ] Remove empty `__tests__/` directory
- [ ] Verify all tests pass after reorganization

## Phase 2: Standardize Effect Helpers

Align helper function naming across all test files.

- [ ] Audit helper names in `init/handler.test.ts`
- [ ] Audit helper names in `skills/add/handler.test.ts`
- [ ] Audit helper names in core test files (post-move)
- [ ] Standardize to `run`/`runEither` pattern where inconsistent
- [ ] Add JSDoc comments to helpers for clarity

## Phase 3: Add Missing Error Tests

Ensure all exported error types have test coverage.

- [ ] Add `ParseError` edge case tests to source-parser
- [ ] Add `LockfileError` tests to lockfile
- [ ] Add `GitError` tests to git module
- [ ] Add `InstallError` tests to installer module
- [ ] Verify error message content in assertions

## Phase 4: Improve Test Names

Review and update test names for behavioral clarity.

- [ ] Audit core package test names
- [ ] Audit CLI handler test names
- [ ] Audit E2E test names
- [ ] Update names to use behavioral verbs (returns, creates, fails with)
- [ ] Ensure names describe what is tested, not how

## Verification

- [ ] Run full test suite: `pnpm test`
- [ ] Run type check: `pnpm typecheck`
- [ ] Run linter: `pnpm lint`
- [ ] Manual review of test organization structure
