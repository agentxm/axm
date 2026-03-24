> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Output service module

> **Subagent:** Run this entire phase in a single subagent.

- [x] 1.1 Create `src/output/output.ts` with `Output` service definition, all message method signatures, `stream` method, `result` method, and exported types (`BoxOptions`, `StreamLevel`)
- [x] 1.2 Create `src/output/output-test.ts` with `makeOutputTestLayer()` returning `[Layer, MockOutputService]` that records method calls
- [x] 1.3 Write unit tests for `makeOutputTestLayer` verifying call recording for message methods, stream, and result
- [x] 1.4 Create `src/output/output-live.ts` with `OutputLive` layer that imports `@clack/prompts` directly and delegates message methods 1:1 to `p.log.*`, `p.intro`, `p.outro`, `p.cancel`, `p.note`, `p.box`. Implement `stream` dispatching to `p.stream.*` by level. Implement `result` with format-aware dispatch (text/json/stream-json)
- [x] 1.5 Create `src/output/output-structured.ts` with `OutputStructured(mode)` layer factory — json mode routes messages to stderr, stream-json mode emits NDJSON log events, result emits typed data per format
- [x] 1.6 Write unit tests for `OutputLive` verifying delegation to Clack for each message method
- [x] 1.7 Write unit tests for `OutputStructured` verifying NDJSON event emission (stream-json) and stderr routing (json)
- [x] 1.8 Create `src/output/index.ts` barrel exporting `Output`, `OutputLive`, `OutputStructured`, `makeOutputTestLayer`, and all types
- [x] 1.9 Run `pnpm typecheck` and fix any errors
- [x] 1.10 Run `pnpm lint` and fix any errors
- [x] 1.11 Run `pnpm test` and fix any failures
- [x] 1.12 Kill any vitest worker processes

## 2. Activity service module

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1 (Output types are referenced in structured layer for event schemas)

- [x] 2.1 Create `src/activity/activity.ts` with `Activity` service definition and all exported types (`SpinnerHandle`, `SpinnerOptions`, `ProgressConfig`, `ProgressHandle`, `TaskLogConfig`, `TaskLogHandle`, `TaskLogGroupHandle`, `Task`)
- [x] 2.2 Create `src/activity/activity-test.ts` with `makeActivityTestLayer(overrides?)` returning `[Layer, MockActivityService]` — default mock executes inner effects with no-op handles
- [x] 2.3 Write unit tests for `makeActivityTestLayer` verifying pass-through execution and call recording
- [x] 2.4 Create `src/activity/activity-live.ts` with `ActivityLive` layer that imports `@clack/prompts` directly. Implement `startSpinner`/`withSpinner` (inline current `ClackSpinner` live logic including `matchCauseEffect` interruption handling). Implement `startProgress`/`withProgress` (inline current `ClackProgress` live logic). Implement `startTaskLog`/`withTaskLog` (inline current `ClackTaskLog` live logic plus scoped wrapper). Implement `runTasks` (inline current `tasks.ts` logic)
- [x] 2.5 Create `src/activity/activity-structured.ts` with `ActivityStructured(mode)` layer factory — spinner/progress emit NDJSON progress events in stream-json, no-op in json. Task log emits prefixed NDJSON log events
- [x] 2.6 Write unit tests for `ActivityLive` verifying spinner lifecycle (start/stop, withSpinner success, failure, interruption), progress advance, task log groups
- [x] 2.7 Write unit tests for `ActivityStructured` verifying NDJSON progress events and no-op handles
- [x] 2.8 Create `src/activity/index.ts` barrel exporting `Activity`, `ActivityLive`, `ActivityStructured`, `makeActivityTestLayer`, and all types
- [x] 2.9 Run `pnpm typecheck` and fix any errors
- [x] 2.10 Run `pnpm lint` and fix any errors
- [x] 2.11 Run `pnpm test` and fix any failures
- [x] 2.12 Kill any vitest worker processes

## 3. Input service module

> **Subagent:** Run this entire phase in a single subagent.

Can run in parallel with Phase 2.

- [x] 3.1 Create `src/input/input.ts` with `Input` service definition and all exported config types (`InputOption`, `TextConfig`, `PasswordConfig`, `ConfirmConfig`, `SelectConfig`, `MultiselectConfig`, `GroupMultiselectConfig`, `SelectKeyConfig`, `AutocompleteConfig`, `AutocompleteMultiselectConfig`, `PathConfig`)
- [x] 3.2 Create `src/input/input-test.ts` with `makeInputTestLayer(overrides)` returning `[Layer, MockInputService]` — preconfigurable return values per method, records calls
- [x] 3.3 Write unit tests for `makeInputTestLayer` verifying configured responses and call recording
- [x] 3.4 Create `src/input/input-live.ts` with `InputLive` layer that imports `@clack/prompts` directly, depends on `CliFlags`. Inline current `guardedPrompt` non-interactive guard and `wrapPrompt` cancel detection. Delegate all 10 prompt methods to `@clack/prompts` with `asClack` type bridge
- [x] 3.5 Create `src/input/input-structured.ts` with `InputStructured` layer — all methods fail with `PROMPT_IN_STRUCTURED_OUTPUT` AppError
- [x] 3.6 Write unit tests for `InputLive` verifying non-interactive guard (fails with `PROMPT_IN_NON_INTERACTIVE`)
- [x] 3.7 Write unit tests for `InputStructured` verifying all methods fail with `PROMPT_IN_STRUCTURED_OUTPUT`
- [x] 3.8 Create `src/input/index.ts` barrel exporting `Input`, `InputLive`, `InputStructured`, `makeInputTestLayer`, and all types
- [x] 3.9 Run `pnpm typecheck` and fix any errors
- [x] 3.10 Run `pnpm lint` and fix any errors
- [x] 3.11 Run `pnpm test` and fix any failures
- [x] 3.12 Kill any vitest worker processes

## 4. Wire new layers in command-runtime.ts

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phases 1, 2, 3

- [x] 4.1 Update `command-runtime.ts` imports: replace `ClackLive`/`ClackStructuredLive` with `OutputLive`/`OutputStructured`, `ActivityLive`/`ActivityStructured`, `InputLive`/`InputStructured`
- [x] 4.2 Replace the `clackLayer` composition with `uiLayer` using `Layer.mergeAll` of the three service layers (text mode and structured mode branches)
- [x] 4.3 Ensure `OutputLive` receives the resolved output format for `result()` dispatch — pass `explicitFormat` or resolved format into the layer
- [x] 4.4 Run `pnpm typecheck` and fix any errors
- [x] 4.5 Run `pnpm lint` and fix any errors
- [x] 4.6 Run `pnpm test` and fix any failures
- [x] 4.7 Run `pnpm test:e2e` and fix any failures
- [x] 4.8 Kill any vitest worker processes

## 5. Migrate handlers to new services

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 5.1, 5.2, 5.3, 5.4, 5.5 are independent — launch as parallel subagents.

Depends on: Phase 4

- [x] 5.1 Migrate `cli-commands/skills/` handlers: replace `Log`/`ClackLog` → `Output`, `Spinner`/`ClackSpinner` → `Activity`, `ClackPrompt`/`Multiselect`/`TextInput` → `Input`. Update all imports and service yields. Files: `new/handler.ts`, `install/command-actions.ts`, `install/select-skills.ts`, `uninstall/handler.ts`, `enable/handler.ts`, `disable/handler.ts`, `list/handler.ts`, `rename/handler.ts`, `fork/handler.ts`, `publish/handler.ts`, `update/handler.ts`
- [x] 5.2 Migrate `cli-commands/packs/` handlers: same replacements. Files: `new/handler.ts`, `install/command-actions.ts`, `uninstall/handler.ts`, `add/handler.ts`, `remove/handler.ts`, `publish/handler.ts`, `unpack/handler.ts`
- [x] 5.3 Migrate `cli-commands/auth/` handlers: replace `ClackLog` → `Output`, `ClackSpinner` → `Activity`, `ClackPrompt` → `Input`. Files: `login/handler.ts`, `logout/handler.ts`, `whoami/handler.ts`
- [x] 5.4 Migrate `cli-commands/init/handler.ts`, `cli-commands/mcp-servers/install/command-actions.ts`, and workflow files in `workflows/`
- [x] 5.5 Migrate shared modules: `workspace/display-plan.ts`, `workspace/initialization.ts`, `auth/guard.ts` — replace Clack service imports with Output/Activity/Input
- [x] 5.6 Run `pnpm typecheck` and fix any errors
- [x] 5.7 Run `pnpm lint` and fix any errors
- [x] 5.8 Run `pnpm test` and fix any failures
- [x] 5.9 Run `pnpm test:e2e` and fix any failures
- [x] 5.10 Kill any vitest worker processes

## 6. Migrate unit tests to new test layers

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 6.1, 6.2, 6.3, 6.4 are independent — launch as parallel subagents.

Depends on: Phase 5

- [x] 6.1 Migrate `cli-commands/skills/` test files: replace `makeClackLogTestLayer`/`makeClackSpinnerTestLayer`/`makeClackPromptTestLayer` with `makeOutputTestLayer`/`makeActivityTestLayer`/`makeInputTestLayer`. Update all service references in test assertions
- [x] 6.2 Migrate `cli-commands/packs/` test files: same test layer replacements
- [x] 6.3 Migrate `cli-commands/auth/` test files and `auth/guard.test.ts`: same test layer replacements
- [x] 6.4 Migrate remaining test files: `cli-commands/init/handler.test.ts`, `cli-commands/mcp-servers/`, `workspace/display-plan.test.ts`, `workspace/service.test.ts`, workflow test files
- [x] 6.5 Run `pnpm typecheck` and fix any errors
- [x] 6.6 Run `pnpm lint` and fix any errors
- [x] 6.7 Run `pnpm test` and fix any failures
- [x] 6.8 Run `pnpm test:e2e` and fix any failures
- [x] 6.9 Kill any vitest worker processes

## 7. Update dev demo commands

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 5

- [x] 7.1 Update `dev-cli-commands/tui/log/command.ts` to use `Output` and `OutputLive`
- [x] 7.2 Update `dev-cli-commands/tui/spinner/command.ts` to use `Activity` and `ActivityLive`
- [x] 7.3 Update `dev-cli-commands/tui/confirm/command.ts`, `select/command.ts`, `multiselect/command.ts`, `text-input/command.ts`, `password-input/command.ts`, `note/command.ts` to use `Input`/`Output` and `InputLive`/`OutputLive`
- [x] 7.4 Run `pnpm typecheck` and fix any errors
- [x] 7.5 Run `pnpm lint` and fix any errors
- [x] 7.6 Run `pnpm test` and fix any failures
- [x] 7.7 Kill any vitest worker processes

## 8. Delete clack-effect/ and clean up

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phases 6, 7

- [x] 8.1 Delete `src/clack-effect/` directory entirely
- [x] 8.2 Remove `writeOutput` and `resolveOutputFormat` from `output.ts` (keep `emitEvent` and NDJSON event schemas — these are used by structured layers)
- [x] 8.3 Remove any remaining imports of `clack-effect/` across the codebase
- [x] 8.4 Remove legacy aliases (`Log`, `Spinner`, `PromptBehavior`) — verify no remaining references
- [x] 8.5 Run `pnpm typecheck` and fix any errors
- [x] 8.6 Run `pnpm lint` and fix any errors
- [x] 8.7 Run `pnpm test` and fix any failures
- [x] 8.8 Run `pnpm test:e2e` and fix any failures
- [x] 8.9 Kill any vitest worker processes
