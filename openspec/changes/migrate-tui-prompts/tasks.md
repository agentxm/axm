> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Runtime Layer Swap

> **Subagent:** Run this entire phase in a single subagent.

- [x] 1.1 Replace `ClackLive` with `TuiLive` in `runtime/index.ts` — update `AppLayer` type and layer composition
- [x] 1.2 Typecheck: `pnpm typecheck` — expect failures in consumers (confirms the swap propagated)
- [x] 1.3 Run `pnpm lint` — fix any lint errors in modified files

## 2. Migrate Production Consumers — Workspace

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1

- [x] 2.1 Migrate `workspace/display-plan.ts` — replace `Clack` import with `Log`, swap `clack.log.*` calls to `Log.*`
- [x] 2.2 Migrate `workspace/ensure-agents.ts` — replace `Clack` with `Log` + `Confirm`, swap method calls
- [x] 2.3 Migrate `workspace/service.ts` — replace `Clack` with `Log` + `Confirm`, replace `clack.outro` with `Log.info`
- [x] 2.4 Typecheck: `pnpm typecheck` — fix any type errors in workspace module
- [x] 2.5 Run `pnpm lint` — fix any lint errors in modified files

## 3. Migrate Production Consumers — CLI Commands

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1

> **Parallelization:** Tasks 3.1, 3.2, 3.3, 3.4, 3.5 are independent — launch as parallel subagents.

- [x] 3.1 Migrate `cli-commands/init/handler.ts` — replace `Clack` with `Log`, swap `intro`→`Log.info`, `outro`→`Log.success`, `log.info`→`Log.info`
- [x] 3.2 Migrate `cli-commands/skills/install/handler.ts` — replace `Clack` with `Log` + `Spinner` + `Multiselect`, adapt spinner to effectful API (`start` returns handle, `stop` is effectful)
- [x] 3.3 Migrate `cli-commands/skills/install/select-skills.ts` — replace `Clack` with `Log` + `Multiselect`, adapt multiselect config
- [x] 3.4 Migrate `cli-commands/skills/uninstall/handler.ts` — replace `Clack` with `Log`, swap `intro`/`outro`/`log.warn`
- [x] 3.5 Migrate `cli-commands/skills/utils.ts` — replace `Clack` with `Select`, adapt select config
- [x] 3.6 Typecheck: `pnpm typecheck` — fix any type errors in cli-commands
- [x] 3.7 Run `pnpm lint` — fix any lint errors in modified files

## 4. Migrate Tests — Workspace

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 2

> **Parallelization:** Tasks 4.1, 4.2, 4.3 are independent — launch as parallel subagents.

- [x] 4.1 Migrate `workspace/display-plan.test.ts` — replace `makeClackTestLayer` with `makeLogTestLayer`, update assertions to use `mockLog.records`
- [x] 4.2 Migrate `workspace/ensure-agents.test.ts` — replace `makeClackTestLayer` with `makeLogTestLayer` + `makeConfirmTestLayer`, update assertions
- [x] 4.3 Migrate `workspace/service.test.ts` — replace `makeClackTestLayer` with composed TUI test layers (`Log`, `Confirm`, `Multiselect`, `Select` as needed), update assertions
- [x] 4.4 Typecheck: `pnpm typecheck` — fix any type errors
- [x] 4.5 Run tests: `pnpm test` — verify all workspace tests pass
- [x] 4.6 Run `pnpm lint` — fix any lint errors
- [x] 4.7 Kill any lingering vitest worker processes

## 5. Migrate Tests — CLI Commands

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 3

> **Parallelization:** Tasks 5.1, 5.2, 5.3, 5.4, 5.5 are independent — launch as parallel subagents.

- [x] 5.1 Migrate `cli-commands/init/handler.test.ts` — replace `makeClackTestLayer` with `makeLogTestLayer`, update assertions
- [x] 5.2 Migrate `cli-commands/skills/install/handler.test.ts` — replace `makeClackTestLayer` with composed TUI test layers (`Log`, `Spinner`, `Multiselect`), update assertions for spinner mock (`mockSpinner.starts`, `mockSpinner.stops`)
- [x] 5.3 Migrate `cli-commands/skills/install/select-skills.test.ts` — replace `makeClackTestLayer` with `makeLogTestLayer` + `makeMultiselectTestLayer`, update assertions
- [x] 5.4 Migrate `cli-commands/skills/uninstall/handler.test.ts` — replace `makeClackTestLayer` with `makeLogTestLayer`, update assertions
- [x] 5.5 Migrate `cli-commands/skills/utils.test.ts` — replace `makeClackTestLayer` with `makeSelectTestLayer`, update assertions
- [x] 5.6 Typecheck: `pnpm typecheck` — fix any type errors
- [x] 5.7 Run tests: `pnpm test` — verify all CLI command tests pass
- [x] 5.8 Run `pnpm lint` — fix any lint errors
- [x] 5.9 Kill any lingering vitest worker processes

## 6. Remove Clack-Effect Module and Dependency

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phases 4 and 5

- [x] 6.1 Verify no remaining imports of `@/clack-effect` or `clack-effect` anywhere in the codebase
- [x] 6.2 Delete the `packages/cli/src/clack-effect/` directory (service.ts, types.ts, errors.ts, test.ts, index.ts)
- [x] 6.3 Remove `@clack/prompts` from `packages/cli/package.json` dependencies
- [x] 6.4 Run `pnpm install` to update lockfile
- [x] 6.5 Typecheck: `pnpm typecheck` — verify clean build with no clack references
- [x] 6.6 Run `pnpm lint` — verify clean lint
- [x] 6.7 Run tests: `pnpm test` — full test suite passes
- [x] 6.8 Run e2e tests: `pnpm test:e2e` — verify end-to-end behavior
- [x] 6.9 Kill any lingering vitest worker processes
