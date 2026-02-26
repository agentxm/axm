> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Spinner Hardening Prerequisites

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 1.2, 1.3, 1.4 are independent once 1.1 lands - launch as parallel subagents.

- [ ] 1.1 Add regression tests for spinner failure-path finalization where spinner start occurs before possible early failures.
- [ ] 1.2 Refactor skills install spinner flows to guarantee finalization (`withSpinner` or explicit stop/cancel/error on every path).
- [ ] 1.3 Refactor packs install spinner flows to guarantee finalization (`withSpinner` or explicit stop/cancel/error on every path).
- [ ] 1.4 Refactor remaining spinner call sites (publish/update/fork/unpack and dev spinner command) to guarantee finalization.
- [ ] 1.5 Run `pnpm typecheck`; fix all errors.
- [ ] 1.6 Run `pnpm lint`; fix all errors.
- [ ] 1.7 Run `pnpm test`; fix all failures.
- [ ] 1.8 Run `pnpm test:e2e`; fix all failures.
- [ ] 1.9 Kill any Vitest worker processes.

## 2. Clack Test Helper Readiness

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 2.1 Add/extend clack prompt test utilities to support per-method behavior and queued per-call behavior.
- [ ] 2.2 Add tests for enhanced clack prompt test helper behavior (mixed confirm/select/multiselect/text/password in one test scope).
- [ ] 2.3 Update clack log test utilities only if needed to preserve assertion clarity for existing call expectations.
- [ ] 2.4 Run `pnpm typecheck`; fix all errors.
- [ ] 2.5 Run `pnpm lint`; fix all errors.
- [ ] 2.6 Run `pnpm test`; fix all failures.
- [ ] 2.7 Run `pnpm test:e2e`; fix all failures.
- [ ] 2.8 Kill any Vitest worker processes.

## 3. Runtime and PromptCancelled Migration

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 3.1 Update runtime to provide `ClackLive` and clack service requirements in `AppLayer`.
- [ ] 3.2 Remove `Spinner.stopAll` runtime cleanup only after phase 1 hardening is merged.
- [ ] 3.3 Migrate `PromptCancelled` imports from `tui` paths to `prompt-cancelled` in runtime and workspace files.
- [ ] 3.4 Add/update runtime tests to validate error classification still returns exit code 0 for `PromptCancelled`.
- [ ] 3.5 Run `pnpm typecheck`; fix all errors.
- [ ] 3.6 Run `pnpm lint`; fix all errors.
- [ ] 3.7 Run `pnpm test`; fix all failures.
- [ ] 3.8 Run `pnpm test:e2e`; fix all failures.
- [ ] 3.9 Kill any Vitest worker processes.

## 4. Source and Workflow Migration to Clack Services

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 4.2, 4.3, 4.4 are independent after 4.1 and can be run in parallel subagents.

- [ ] 4.1 Migrate shared workspace/source modules (`workspace/service.ts`, `workspace/display-plan.ts`, `sources/registry-guard.ts`) and related tests from `@/tui` to `@/clack-effect`.
- [ ] 4.2 Migrate skills command and operation source files to clack services, including prompt config adaptation and return-type preservation.
- [ ] 4.3 Migrate packs command and operation source files to clack services, including prompt config adaptation and return-type preservation.
- [ ] 4.4 Migrate commands/mcp-servers/install workflows and operation modules to clack services where they depend on log/prompt/spinner services.
- [ ] 4.5 Migrate workflow tests (`workflows/install-command/*`, `workflows/uninstall-command/*`) to clack test layers.
- [ ] 4.6 Run `pnpm typecheck`; fix all errors.
- [ ] 4.7 Run `pnpm lint`; fix all errors.
- [ ] 4.8 Run `pnpm test`; fix all failures.
- [ ] 4.9 Run `pnpm test:e2e`; fix all failures.
- [ ] 4.10 Kill any Vitest worker processes.

## 5. Handler Test Migration and Assertion Normalization

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 5.1 and 5.2 are independent and can run in parallel subagents.

- [ ] 5.1 Migrate all skills handler tests from TUI test factories to clack test layers, updating assertions for clack call shapes.
- [ ] 5.2 Migrate all packs handler tests from TUI test factories to clack test layers, updating assertions for clack call shapes.
- [ ] 5.3 Migrate workspace and extension operation tests that currently rely on TUI test-layer helpers.
- [ ] 5.4 Remove remaining direct imports from `tui/log/index.js` and other TUI submodules in tests.
- [ ] 5.5 Run `pnpm typecheck`; fix all errors.
- [ ] 5.6 Run `pnpm lint`; fix all errors.
- [ ] 5.7 Run `pnpm test`; fix all failures.
- [ ] 5.8 Run `pnpm test:e2e`; fix all failures.
- [ ] 5.9 Kill any Vitest worker processes.

## 6. Dev CLI TUI Playground and E2E Updates

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 6.1 Migrate all `src/dev-cli-commands/tui/*/command.ts` files to clack services (`ClackPrompt`, `ClackLog`, `ClackSpinner`, `ClackLive`).
- [ ] 6.2 Update `src/dev-cli-commands/tui/command.e2e.test.ts` expectations for clack-backed behavior and output.
- [ ] 6.3 Update `src/dev-main.ts` imports only if command module locations change.
- [ ] 6.4 Run `pnpm typecheck`; fix all errors.
- [ ] 6.5 Run `pnpm lint`; fix all errors.
- [ ] 6.6 Run `pnpm test`; fix all failures.
- [ ] 6.7 Run `pnpm test:e2e`; fix all failures.
- [ ] 6.8 Kill any Vitest worker processes.

## 7. TUI Removal and Dependency Cleanup

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 7.1 Confirm there are no remaining imports of `src/tui` or `@/tui` in production/test/dev files.
- [ ] 7.2 Delete `packages/cli/src/tui/` and any dead references.
- [ ] 7.3 Remove `ink`, `ink-spinner`, `ink-select-input`, `ink-text-input`, and `react` dependencies from `packages/cli/package.json`.
- [ ] 7.4 Remove no-longer-needed type/dev dependencies tied only to deleted Ink/React code.
- [ ] 7.5 Run `pnpm typecheck`; fix all errors.
- [ ] 7.6 Run `pnpm lint`; fix all errors.
- [ ] 7.7 Run `pnpm test`; fix all failures.
- [ ] 7.8 Run `pnpm test:e2e`; fix all failures.
- [ ] 7.9 Kill any Vitest worker processes.
