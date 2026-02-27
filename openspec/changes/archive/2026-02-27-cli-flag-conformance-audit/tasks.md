> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Non-interactive resolution and TTY auto-detection

> **Subagent:** Run this entire phase in a single subagent.

Wire `--non-interactive` to imply `--yes` and auto-enable on non-TTY stdin. This is the foundation — all subsequent phases depend on it.

- [x] 1.1 Write tests for non-interactive resolution: `--non-interactive` implies `--yes`, non-TTY stdin auto-enables `--non-interactive`, `CI=true` auto-enables `--non-interactive`
- [x] 1.2 Update `resolvedNonInteractive` in `workspace/service.ts` to check `isInteractive()` from `utils/tty.ts` as a fallback alongside `CI=true`
- [x] 1.3 Add `resolvedYes` that is `true` when explicit `--yes` OR `resolvedNonInteractive` is `true`; use `resolvedYes` in all confirmation checks
- [x] 1.4 Run typecheck (`pnpm typecheck`), fix any errors
- [x] 1.5 Run linting (`pnpm lint`), fix any errors
- [x] 1.6 Run tests (`pnpm test`), fix any failures
- [x] 1.7 Run e2e tests (`pnpm test:e2e`), fix any failures
- [x] 1.8 Kill any vitest worker processes

## 2. Warnings never block

> **Subagent:** Run this entire phase in a single subagent.

Change warning readiness from prompting/blocking to display-and-proceed. Depends on Phase 1.

- [x] 2.1 Write tests for new warning behavior: warnings are displayed but never prompt, warnings proceed without `--force`, warnings are shown in both preview and default modes
- [x] 2.2 Update `resolvePlan()` in `workspace/service.ts`: remove the warning confirmation prompt block (lines ~651-673), replace with unconditional warning display that proceeds
- [x] 2.3 Update existing `plan-confirm-apply` tests that assert warning prompting/blocking behavior
- [x] 2.4 Run typecheck (`pnpm typecheck`), fix any errors
- [x] 2.5 Run linting (`pnpm lint`), fix any errors
- [x] 2.6 Run tests (`pnpm test`), fix any failures
- [x] 2.7 Run e2e tests (`pnpm test:e2e`), fix any failures
- [x] 2.8 Kill any vitest worker processes

## 3. --force overrides error constraints

> **Subagent:** Run this entire phase in a single subagent.

Change `--force` from warning auto-acceptance to error constraint override. Depends on Phase 2.

- [x] 3.1 Write tests for new `--force` behavior: errors block without `--force` (with `howToFix` suggesting `--force`), errors are downgraded to warnings with `--force`, `--force` does not skip confirmation prompts
- [x] 3.2 Update `resolvePlan()` error-readiness block (lines ~641-647): when `force` is `true`, downgrade errors to displayed warnings and proceed; when `force` is `false`, fail with `howToFix` suggesting `--force`
- [x] 3.3 Update existing tests that assert error-readiness always blocks
- [x] 3.4 Run typecheck (`pnpm typecheck`), fix any errors
- [x] 3.5 Run linting (`pnpm lint`), fix any errors
- [x] 3.6 Run tests (`pnpm test`), fix any failures
- [x] 3.7 Run e2e tests (`pnpm test:e2e`), fix any failures
- [x] 3.8 Kill any vitest worker processes

## 4. Fix --force propagation and descriptions

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 4.2, 4.3 are independent — launch as parallel subagents.

Fix broken flag propagation and align descriptions. Depends on Phase 3.

- [x] 4.1 Write tests verifying `--force` reaches plan resolution for `skills install` and `packs install`
- [x] 4.2 Fix `skills install`: add `force` to the intent type and pass through the intent chain to `resolvePlan`
- [x] 4.3 Fix `packs install`: add `force` to the intent type and pass through the intent chain to `resolvePlan`
- [x] 4.4 Update `--force` description in all 5 command definitions (`skills install`, `skills update`, `packs install`, `commands install`, `mcp-servers install`) to "Override constraints that would cause failure"
- [x] 4.5 Run typecheck (`pnpm typecheck`), fix any errors
- [x] 4.6 Run linting (`pnpm lint`), fix any errors
- [x] 4.7 Run tests (`pnpm test`), fix any failures
- [x] 4.8 Run e2e tests (`pnpm test:e2e`), fix any failures
- [x] 4.9 Kill any vitest worker processes

## 5. --yes no longer supplies selection defaults

> **Subagent:** Run this entire phase in a single subagent.

Move selection-default behavior from `--yes` to `--non-interactive`. Depends on Phase 1.

- [x] 5.1 Write tests: `skills install --yes` with multiple skills still prompts for selection; `skills install --non-interactive` auto-selects all; `init --yes` still prompts for agent selection; `init --non-interactive` auto-selects all agents
- [x] 5.2 Update `select-skills.ts`: change the guard from `args.all || args.yes` to `args.all || args.nonInteractive`; when only `--yes` is set and multiple skills exist, show the selection prompt
- [x] 5.3 Update `initialization.ts`: change the guard from `options.yes` to `resolvedNonInteractive`; when only `--yes` is set and multiple agents exist, show the selection prompt
- [x] 5.4 Update existing tests for `select-skills` and `initialization` that assert `--yes` auto-selects
- [x] 5.5 Run typecheck (`pnpm typecheck`), fix any errors
- [x] 5.6 Run linting (`pnpm lint`), fix any errors
- [x] 5.7 Run tests (`pnpm test`), fix any failures
- [x] 5.8 Run e2e tests (`pnpm test:e2e`), fix any failures
- [x] 5.9 Kill any vitest worker processes
