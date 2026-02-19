> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Remove dead resolution module

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 1.1 Delete `packages/cli/src/resolution/resolver.ts`
- [ ] 1.2 Delete `packages/cli/src/resolution/index.ts`
- [ ] 1.3 Move `packages/cli/src/resolution/resolution-flow.test.ts` to `packages/cli/src/sources/resolution-flow.test.ts` — update relative import paths (imports change from `../sources/` to `./`)
- [ ] 1.4 Remove any `resolution` references from barrel files or tsconfig paths
- [ ] 1.5 Run `pnpm typecheck` — fix any errors
- [ ] 1.6 Run `pnpm lint` — fix any errors
- [ ] 1.7 Run `pnpm test` — fix any failures
- [ ] 1.8 Run `pnpm test:e2e` — fix any failures
- [ ] 1.9 Kill any vitest worker processes

## 2. Remove unused workspace function

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 2.1 Delete `packages/cli/src/workspace/ensure-agents.ts`
- [ ] 2.2 Delete `packages/cli/src/workspace/ensure-agents.test.ts`
- [ ] 2.3 Remove any re-exports of `ensureAgentsConfigured` or `EnsureAgentsOptions` from `packages/cli/src/workspace/index.ts`
- [ ] 2.4 Run `pnpm typecheck` — fix any errors
- [ ] 2.5 Run `pnpm lint` — fix any errors
- [ ] 2.6 Run `pnpm test` — fix any failures
- [ ] 2.7 Kill any vitest worker processes

## 3. Remove unused exports from git, sources, settings, runtime

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 3.1, 3.2, 3.3, 3.4, 3.5 are independent — launch as parallel subagents.

- [ ] 3.1 Remove `cloneRepo`, `getCurrentCommit`, `isGitRepository`, `resolveRef` from `packages/cli/src/git/operations.ts` — remove the functions and their associated tests; keep `getTreeSha` and `shallowClone`; update `packages/cli/src/git/index.ts` barrel to remove deleted exports
- [ ] 3.2 Remove `isGitHostingProviderSource` from `packages/cli/src/sources/utils.ts` — update barrel file if re-exported
- [ ] 3.3 Remove `fetchGitHubTreeHash` export from `packages/cli/src/sources/github/api.ts` — remove the function and its tests from `api.test.ts`; keep other functions in the file; update barrel if re-exported
- [ ] 3.4 Remove `modifyJsonFile`, `ensureTopLevelProperty`, `detectFormatting` from `packages/cli/src/settings/format-preserving-json.ts` — remove the functions and their tests from `format-preserving-json.test.ts`; update `packages/cli/src/settings/index.ts` barrel to remove deleted exports
- [ ] 3.5 Remove `ErrorClassification` type export from `packages/cli/src/runtime/error-handling.ts` — keep the type definition if used internally but remove the `export` keyword; update barrel if re-exported
- [ ] 3.6 Run `pnpm typecheck` — fix any errors
- [ ] 3.7 Run `pnpm lint` — fix any errors
- [ ] 3.8 Run `pnpm test` — fix any failures
- [ ] 3.9 Run `pnpm test:e2e` — fix any failures
- [ ] 3.10 Kill any vitest worker processes

## 4. Address skipped handler test suites

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 4.1 Read `packages/cli/src/cli-commands/skills/install/handler.test.ts` — understand why the suite is wrapped in `describe.skip`; check if test expectations match current handler signatures
- [ ] 4.2 Read `packages/cli/src/cli-commands/skills/update/handler.test.ts` — same analysis
- [ ] 4.3 For each skipped suite: either fix the tests to match current handler APIs and remove `describe.skip`, or remove the dead test code with a comment explaining what replaced it
- [ ] 4.4 Run `pnpm typecheck` — fix any errors
- [ ] 4.5 Run `pnpm lint` — fix any errors
- [ ] 4.6 Run `pnpm test` — fix any failures
- [ ] 4.7 Kill any vitest worker processes

## 5. Extract single-step plan builder

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 5.1 Write tests for the shared `buildSingleStepPlan` helper in `packages/cli/src/cli-commands/skills/plan-helpers.test.ts` — test that it produces a Plan with one job, one step, correct label, description, and expected result
- [ ] 5.2 Create `packages/cli/src/cli-commands/skills/plan-helpers.ts` — extract the common single-step plan construction from enable/disable/rename handlers into a generic typed function
- [ ] 5.3 Run the new tests — verify they pass
- [ ] 5.4 Refactor `packages/cli/src/cli-commands/skills/enable/handler.ts` to use `buildSingleStepPlan`
- [ ] 5.5 Refactor `packages/cli/src/cli-commands/skills/disable/handler.ts` to use `buildSingleStepPlan`
- [ ] 5.6 Refactor `packages/cli/src/cli-commands/skills/rename/handler.ts` to use `buildSingleStepPlan`
- [ ] 5.7 Run `pnpm typecheck` — fix any errors
- [ ] 5.8 Run `pnpm lint` — fix any errors
- [ ] 5.9 Run `pnpm test` — fix any failures
- [ ] 5.10 Run `pnpm test:e2e` — fix any failures
- [ ] 5.11 Kill any vitest worker processes

## 6. Clean up TODO comments

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 6.1 Read the 5 TODO comments in `packages/cli/src/cli-commands/skills/install/resolve-skill-install-source.ts` — understand the error context for each
- [ ] 6.2 Replace each TODO with an accurate, meaningful error message that describes the actual failure condition — remove the TODO comments
- [ ] 6.3 Run `pnpm typecheck` — fix any errors
- [ ] 6.4 Run `pnpm lint` — fix any errors
- [ ] 6.5 Run `pnpm test` — fix any failures
- [ ] 6.6 Kill any vitest worker processes

## 7. Final verification

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 7.1 Run `pnpm typecheck` — full type check across all packages
- [ ] 7.2 Run `pnpm lint` — full lint across all packages
- [ ] 7.3 Run `pnpm test` — full test suite
- [ ] 7.4 Run `pnpm test:e2e` — full E2E suite
- [ ] 7.5 Kill any vitest worker processes
- [ ] 7.6 Verify no remaining references to deleted modules — grep for `resolution/resolver`, `ensure-agents`, `cloneRepo`, `getCurrentCommit`, `isGitRepository`, `resolveRef`, `isGitHostingProviderSource`, `fetchGitHubTreeHash`, `modifyJsonFile`, `ensureTopLevelProperty`, `detectFormatting`
