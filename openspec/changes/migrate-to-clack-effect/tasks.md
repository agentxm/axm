> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Spinner Hardening Prerequisites

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 1.2, 1.3, 1.4 are independent once 1.1 lands - launch as parallel subagents.

- [x] 1.1 Add regression tests for spinner failure-path finalization where spinner start occurs before possible early failures.
- [x] 1.2 Refactor skills install spinner flows to guarantee finalization (`withSpinner` or explicit stop/cancel/error on every path).
- [x] 1.3 Refactor packs install spinner flows to guarantee finalization (`withSpinner` or explicit stop/cancel/error on every path).
- [x] 1.4 Refactor remaining spinner call sites (publish/update/fork/unpack and dev spinner command) to guarantee finalization.
- [x] 1.5 Run `pnpm typecheck`; fix all errors.
- [x] 1.6 Run `pnpm lint`; fix all errors.
- [x] 1.7 Run `pnpm test`; fix all failures.
- [x] 1.8 Run `pnpm test:e2e`; fix all failures.
- [x] 1.9 Kill any Vitest worker processes.

## 2. Clack Test Helper Readiness

> **Subagent:** Run this entire phase in a single subagent.

- [x] 2.1 Add/extend clack prompt test utilities to support per-method behavior and queued per-call behavior.
- [x] 2.2 Add tests for enhanced clack prompt test helper behavior (mixed confirm/select/multiselect/text/password in one test scope).
- [x] 2.3 Update clack log test utilities only if needed to preserve assertion clarity for existing call expectations.
- [x] 2.4 Run `pnpm typecheck`; fix all errors.
- [x] 2.5 Run `pnpm lint`; fix all errors.
- [x] 2.6 Run `pnpm test`; fix all failures.
- [x] 2.7 Run `pnpm test:e2e`; fix all failures.
- [x] 2.8 Kill any Vitest worker processes.

## 3. Runtime and PromptCancelled Migration

> **Subagent:** Run this entire phase in a single subagent.

- [x] 3.1 Update runtime to provide `ClackLive` and clack service requirements in `AppLayer`.
- [x] 3.2 Remove `Spinner.stopAll` runtime cleanup only after phase 1 hardening is merged.
- [x] 3.3 Migrate `PromptCancelled` imports from `tui` paths to `prompt-cancelled` in runtime and workspace files.
- [x] 3.4 Add/update runtime tests to validate error classification still returns exit code 0 for `PromptCancelled`.
- [x] 3.5 Run `pnpm typecheck`; fix all errors.
- [x] 3.6 Run `pnpm lint`; fix all errors.
- [x] 3.7 Run `pnpm test`; fix all failures.
- [x] 3.8 Run `pnpm test:e2e`; fix all failures.
- [x] 3.9 Kill any Vitest worker processes.

## 4. Source and Workflow Migration to Clack Services

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 4.2, 4.3, 4.4 are independent after 4.1 and can be run in parallel subagents.

- [x] 4.1 Migrate shared workspace/source modules (`workspace/service.ts`, `workspace/display-plan.ts`, `sources/registry-guard.ts`) and related tests from `@/tui` to `@/clack-effect`.
- [x] 4.2 Migrate skills command and operation source files to clack services, including prompt config adaptation and return-type preservation.
- [x] 4.3 Migrate packs command and operation source files to clack services, including prompt config adaptation and return-type preservation.
- [x] 4.4 Migrate commands/mcp-servers/install workflows and operation modules to clack services where they depend on log/prompt/spinner services.
- [x] 4.5 Migrate workflow tests (`workflows/install-command/*`, `workflows/uninstall-command/*`) to clack test layers.
- [x] 4.6 Run `pnpm typecheck`; fix all errors.
- [x] 4.7 Run `pnpm lint`; fix all errors.
- [x] 4.8 Run `pnpm test`; fix all failures.
- [x] 4.9 Run `pnpm test:e2e`; fix all failures.
- [x] 4.10 Kill any Vitest worker processes.

## 5. Handler Test Migration and Assertion Normalization

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 5.1 and 5.2 are independent and can run in parallel subagents.

- [x] 5.1 Migrate all skills handler tests from TUI test factories to clack test layers, updating assertions for clack call shapes.
- [x] 5.2 Migrate all packs handler tests from TUI test factories to clack test layers, updating assertions for clack call shapes.
- [x] 5.3 Migrate workspace and extension operation tests that currently rely on TUI test-layer helpers.
- [x] 5.4 Remove remaining direct imports from `tui/log/index.js` and other TUI submodules in tests.
- [x] 5.5 Run `pnpm typecheck`; fix all errors.
- [x] 5.6 Run `pnpm lint`; fix all errors.
- [x] 5.7 Run `pnpm test`; fix all failures.
- [x] 5.8 Run `pnpm test:e2e`; fix all failures.
- [x] 5.9 Kill any Vitest worker processes.

## 6. Dev CLI TUI Playground and E2E Updates

> **Subagent:** Run this entire phase in a single subagent.

- [x] 6.1 Migrate all `src/dev-cli-commands/tui/*/command.ts` files to clack services (`ClackPrompt`, `ClackLog`, `ClackSpinner`, `ClackLive`).
- [x] 6.2 Update `src/dev-cli-commands/tui/command.e2e.test.ts` expectations for clack-backed behavior and output.
- [x] 6.3 Update `src/dev-main.ts` imports only if command module locations change.
- [x] 6.4 Run `pnpm typecheck`; fix all errors.
- [x] 6.5 Run `pnpm lint`; fix all errors.
- [x] 6.6 Run `pnpm test`; fix all failures.
- [x] 6.7 Run `pnpm test:e2e`; fix all failures.
- [x] 6.8 Kill any Vitest worker processes.

## 7. TUI Removal and Dependency Cleanup

> **Subagent:** Run this entire phase in a single subagent.

- [x] 7.1 Confirm there are no remaining imports of `src/tui` or `@/tui` in production/test/dev files.
- [x] 7.2 Delete `packages/cli/src/tui/` and any dead references.
- [x] 7.3 Remove `ink`, `ink-spinner`, `ink-select-input`, `ink-text-input`, and `react` dependencies from `packages/cli/package.json`.
- [x] 7.4 Remove no-longer-needed type/dev dependencies tied only to deleted Ink/React code.
- [x] 7.5 Run `pnpm typecheck`; fix all errors.
- [x] 7.6 Run `pnpm lint`; fix all errors.
- [x] 7.7 Run `pnpm test`; fix all failures.
- [x] 7.8 Run `pnpm test:e2e`; fix all failures.
- [x] 7.9 Kill any Vitest worker processes.
