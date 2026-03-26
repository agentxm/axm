> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Scaffold prompts command group

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 1.2 through 1.11 are independent — launch as parallel subagents after 1.1 completes.

- [x] 1.1 Create `packages/cli-spike/src/root/prompts/command.ts` with empty `promptsCommand` that aggregates subcommands (mirror tui/command.ts pattern)
- [x] 1.2 Create `prompts/text.ts` — `CliPrompt.text()` with flags: `--placeholder`, `--default`, `--initial`, `--validate`
- [x] 1.3 Create `prompts/password.ts` — `CliPrompt.password()` with flag: `--mask`
- [x] 1.4 Create `prompts/confirm.ts` — `CliPrompt.confirm()` with flags: `--active`, `--inactive`, `--initial`, `--vertical`; hardcoded `initialValue` for non-interactive
- [x] 1.5 Create `prompts/path.ts` — `CliPrompt.path()` with flags: `--root`, `--directory`, `--initial`
- [x] 1.6 Create `prompts/select.ts` — `CliPrompt.select()` with flags: `--max-items`, `--initial`; sample color options; hardcoded `initialValue`
- [x] 1.7 Create `prompts/multiselect.ts` — `CliPrompt.multiselect()` with flags: `--max-items`, `--required`, `--cursor-at`; sample fruit options
- [x] 1.8 Create `prompts/group-multiselect.ts` — `CliPrompt.groupMultiselect()` with flags: `--selectable-groups`, `--group-spacing`, `--required`; sample grouped permission options
- [x] 1.9 Create `prompts/select-key.ts` — `CliPrompt.selectKey()` with flag: `--case-sensitive`; sample action options
- [x] 1.10 Create `prompts/autocomplete.ts` — `CliPrompt.autocomplete()` with flags: `--max-items`, `--placeholder`, `--initial-input`; sample timezone options
- [x] 1.11 Create `prompts/autocomplete-multiselect.ts` — `CliPrompt.autocompleteMultiselect()` with flags: `--max-items`, `--required`; sample package dependency options
- [x] 1.12 Register all 10 subcommands in `prompts/command.ts`
- [x] 1.13 Run `pnpm typecheck` and fix any errors
- [x] 1.14 Run `pnpm lint` and fix any errors
- [x] 1.15 Run `pnpm test` and fix any failures
- [x] 1.16 Kill any vitest worker processes

## 2. Scaffold outputs command group

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 2.2 through 2.15 are independent — launch as parallel subagents after 2.1 completes.

- [x] 2.1 Create `packages/cli-spike/src/root/outputs/command.ts` with empty `outputsCommand` that aggregates subcommands
- [x] 2.2 Create `outputs/log.ts` — all 7 log-level methods in sequence; no flags
- [x] 2.3 Create `outputs/intro.ts` — `intro()` and `outro()` together; no flags
- [x] 2.4 Create `outputs/note.ts` — `note()` with and without title; no flags
- [x] 2.5 Create `outputs/box.ts` — `box()` with flags: `--title`, `--content-align`, `--title-align`, `--width`, `--padding`, `--rounded`
- [x] 2.6 Create `outputs/spinner.ts` — `withSpinner()` with flags: `--success-message`, `--failure-message`; `isLongRunning: true`
- [x] 2.7 Create `outputs/progress.ts` — `withProgress()` with flags: `--style`, `--max`, `--size`; `isLongRunning: true`
- [x] 2.8 Create `outputs/task-log.ts` — `withTaskLog()` with flags: `--limit`, `--retain-log`; `isLongRunning: true`
- [x] 2.9 Create `outputs/run-tasks.ts` — `runTasks()` with hardcoded simulated tasks; no flags; `isLongRunning: true`
- [x] 2.10 Create `outputs/table.ts` — `table()` with flag: `--caption`; sample skill data
- [x] 2.11 Create `outputs/detail.ts` — `detail()` with flag: `--title`; sample data
- [x] 2.12 Create `outputs/tree.ts` — `tree()` with flag: `--title`; sample workspace file structure
- [x] 2.13 Create `outputs/stream-log.ts` — `streamLog()` simulating build log; no flags; `isLongRunning: true`
- [x] 2.14 Create `outputs/result.ts` — `result()` and `resultStream()` with flag: `--json`
- [x] 2.15 Create `outputs/raw.ts` — `raw()` and `json()` with flag: `--json`
- [x] 2.16 Register all 14 subcommands in `outputs/command.ts`
- [x] 2.17 Run `pnpm typecheck` and fix any errors
- [x] 2.18 Run `pnpm lint` and fix any errors
- [x] 2.19 Run `pnpm test` and fix any failures
- [x] 2.20 Kill any vitest worker processes

## 3. Wire new commands and remove tui

> **Subagent:** Run this entire phase in a single subagent.

- [x] 3.1 Update `packages/cli-spike/src/app.ts` to import `promptsCommand` and `outputsCommand` instead of `tuiCommand`
- [x] 3.2 Register `promptsCommand` and `outputsCommand` in `Command.withSubcommands()`, remove `tuiCommand`
- [x] 3.3 Delete `packages/cli-spike/src/root/tui/` directory
- [x] 3.4 Run `pnpm typecheck` and fix any errors
- [x] 3.5 Run `pnpm lint` and fix any errors
- [x] 3.6 Run `pnpm test` and fix any failures
- [x] 3.7 Kill any vitest worker processes

## 4. Shared E2E helpers

> **Subagent:** Run this entire phase in a single subagent.

- [x] 4.1 Add `expectStderr(result, pattern)` helper to `packages/e2e-utils/`
- [x] 4.2 Add `expectStdout(result, pattern)` helper to `packages/e2e-utils/`
- [x] 4.3 Add `expectExitCode(result, code)` helper to `packages/e2e-utils/`
- [x] 4.4 Add `parseJsonOutput(result)` helper to `packages/e2e-utils/`
- [x] 4.5 Add `parseNdjsonOutput(result)` helper to `packages/e2e-utils/`
- [x] 4.6 Add `expectNonInteractiveSuccess(runCli, args)` helper to `packages/e2e-utils/`
- [x] 4.7 Add `expectNonInteractiveFailure(runCli, args)` helper to `packages/e2e-utils/`
- [x] 4.8 Export all new helpers from `packages/e2e-utils/` barrel
- [x] 4.9 Run `pnpm typecheck` and fix any errors
- [x] 4.10 Run `pnpm lint` and fix any errors
- [x] 4.11 Kill any vitest worker processes

## 5. E2E tests for outputs commands

> **Subagent:** Run this entire phase in a single subagent.

Depends on: phases 2, 3, 4.

- [x] 5.1 Create `packages/cli-spike-e2e/src/outputs.e2e.test.ts`
- [x] 5.2 Test: `outputs --help` lists all 14 subcommands
- [x] 5.3 Test: `outputs log` produces all 7 log levels on stderr
- [x] 5.4 Test: `outputs intro` renders intro/outro framing
- [x] 5.5 Test: `outputs note` renders boxed note
- [x] 5.6 Test: `outputs box` renders default box
- [x] 5.7 Test: `outputs box --rounded --width 40` renders with options
- [x] 5.8 Test: `outputs spinner` completes with success (long timeout)
- [x] 5.9 Test: `outputs progress --style block` renders progress bar
- [x] 5.10 Test: `outputs task-log --retain-log` retains output
- [x] 5.11 Test: `outputs run-tasks` shows task status
- [x] 5.12 Test: `outputs table` renders table with data
- [x] 5.13 Test: `outputs table --caption "My Table"` passes caption through
- [x] 5.14 Test: `outputs detail` renders key/value pairs
- [x] 5.15 Test: `outputs tree` renders hierarchical structure
- [x] 5.16 Test: `outputs stream-log` produces streaming output
- [x] 5.17 Test: `outputs result` renders human-readable output
- [x] 5.18 Test: `outputs result --json` emits valid JSON
- [x] 5.19 Test: `outputs raw` outputs unformatted text
- [x] 5.20 Test: `outputs raw --json` outputs JSON
- [x] 5.21 Run `pnpm build` to build artifacts for E2E
- [x] 5.22 Run `pnpm test:e2e` and fix any failures
- [x] 5.23 Kill any vitest worker processes

## 6. E2E tests for prompts commands

> **Subagent:** Run this entire phase in a single subagent.

Depends on: phases 1, 3, 4.

- [x] 6.1 Create `packages/cli-spike-e2e/src/prompts.e2e.test.ts`
- [x] 6.2 Test: `prompts --help` lists all 10 subcommands
- [x] 6.3 Test: `prompts text --help` renders help with flags
- [x] 6.4 Test: `prompts text --non-interactive --default "hi"` succeeds
- [x] 6.5 Test: `prompts text --non-interactive` (no default) fails with non-zero exit
- [x] 6.6 Test: `prompts confirm --non-interactive` succeeds with initial value
- [x] 6.7 Test: `prompts select --non-interactive` succeeds with initial value
- [x] 6.8 Test: each prompt subcommand `--help` renders
- [x] 6.9 Run `pnpm build` to build artifacts for E2E
- [x] 6.10 Run `pnpm test:e2e` and fix any failures
- [x] 6.11 Kill any vitest worker processes

## 7. Machine-readable mode E2E tests

> **Subagent:** Run this entire phase in a single subagent.

Depends on: phases 5, 6.

- [x] 7.1 Add test: `outputs result --output-format json` emits structured JSON via global flag
- [x] 7.2 Add test: `outputs table --output-format json` emits table data as JSON
- [x] 7.3 Run `pnpm build` to build artifacts for E2E
- [x] 7.4 Run `pnpm test:e2e` and fix any failures
- [x] 7.5 Kill any vitest worker processes

## 8. Final verification

> **Subagent:** Run this entire phase in a single subagent.

- [x] 8.1 Run `pnpm typecheck` — verify zero errors across all packages
- [x] 8.2 Run `pnpm lint` — verify zero errors across all packages
- [x] 8.3 Run `pnpm test` — verify all unit tests pass
- [x] 8.4 Run `pnpm build` — verify clean build
- [x] 8.5 Run `pnpm test:e2e` — verify all E2E tests pass
- [x] 8.6 Kill any vitest worker processes
- [x] 8.7 Delete old `packages/cli-spike-e2e/src/tui.e2e.test.ts` if still present
- [x] 8.8 Verify `axm-spike prompts --help` and `axm-spike outputs --help` list all expected subcommands
