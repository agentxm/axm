> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. ANSI chrome primitives

> **Subagent:** Run this entire phase in a single subagent.

Build the shared stderr rendering module that replaces clack's chrome helpers.

- [ ] 1.1 Create `packages/core/src/unstable/cli-renderer/ansi-chrome.ts` with shared stderr helpers: symbol constants, level-to-color mapping, `styledLine`, terminal-width lookup, rule/box builders, and raw ANSI erase/cursor helpers where Effect ANSI does not expose them
- [ ] 1.2 Implement flat symbol-prefixed renderers for `intro`, `outro`, `message`, `info`, `success`, `step`, `warn`, `error`, and `cancel` using Effect ANSI `annotate`
- [ ] 1.3 Implement `note` and `box` renderers with optional title, configurable alignment/padding/width, and box-drawing characters
- [ ] 1.4 Implement spinner primitives with `◒◐◓◑` frame cycling, in-place line updates, and `Effect.acquireRelease` cleanup; expose `stop`, `update`, `cancel`, `error`, and `clear`
- [ ] 1.5 Implement progress-bar primitives with adaptive width, percentage formatting, indeterminate/update states, and final success/error/cancel rendering
- [ ] 1.6 Implement `streamLog` accumulation and grouped `taskLog` output primitives that render to stderr with the new visual language
- [ ] 1.7 Write focused tests for symbol/color output, note/box layout, spinner/progress state transitions, grouped task-log rendering, and stderr-only channel behavior
- [ ] 1.8 Run `pnpm typecheck` and fix any errors including `@effect/language-service` diagnostics
- [ ] 1.9 Run `pnpm lint` and fix any errors
- [ ] 1.10 Run `pnpm test` and fix any failures
- [ ] 1.11 Kill any vitest worker processes

## 2. InteractiveRenderer integration

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1.

- [ ] 2.1 Rewrite `packages/core/src/unstable/cli-renderer/cli-renderer-interactive.ts` to depend on `ansi-chrome.ts` instead of `@clack/prompts`, keeping the `CliRenderer` service interface unchanged
- [ ] 2.2 Reimplement `withSpinner`, `withProgress`, `taskLog`, `withTaskLog`, and `runTasks` on top of the new handles, preserving success/failure/interrupt semantics and sequential task execution
- [ ] 2.3 Update table formatter to drop the `│  ` guide prefix while preserving column sizing and truncation behavior
- [ ] 2.4 Update detail formatter to drop the `│  ` guide prefix
- [ ] 2.5 Update tree formatter to drop the outer `│  ` guide prefix while keeping nested `│`, `├─`, and `└─` connectors
- [ ] 2.6 Rewrite `packages/core/src/unstable/cli-renderer/cli-renderer-interactive.test.ts` to capture stderr/stdout directly and cover log levels, intro/outro/cancel, note, box, streamLog, spinner/progress, taskLog/runTasks, and stdout-only data display
- [ ] 2.7 Run `pnpm typecheck` and fix any errors including `@effect/language-service` diagnostics
- [ ] 2.8 Run `pnpm lint` and fix any errors
- [ ] 2.9 Run `pnpm test` and fix any failures
- [ ] 2.10 Kill any vitest worker processes

## 3. Retire the clack-backed CliPrompt layer

> **Subagent:** Run this entire phase in a single subagent.

No dependency on Phases 1-2. Can run in parallel with them.

- [ ] 3.1 Introduce a new Effect-backed interactive `CliPrompt` module under `packages/core/src/unstable/cli-prompt/` using native `Prompt` plus `@axm.sh/core/unstable/cli/prompt` helpers, while preserving the existing `CliPrompt` service interface and `PromptCancelled` / `AppError` boundary behavior
- [ ] 3.2 Update `packages/core/src/unstable/cli-runtime/runtime-envelope.ts` and `packages/core/src/unstable/cli-runtime/runtime-envelope.test.ts` to load the new interactive prompt layer instead of the clack-specific module
- [ ] 3.3 Add prompt-layer coverage for `select`, `multiselect`, `groupMultiselect`, `selectKey`, `autocomplete`, `autocompleteMultiselect`, `path`, and non-interactive guards so removing tokenization adapters does not lose behavior coverage
- [ ] 3.4 Delete `packages/core/src/unstable/cli-prompt/cli-prompt-interactive.ts`, `packages/core/src/unstable/cli-prompt/clack-prompt-options.ts`, and the old clack-specific test file after the new module is wired; update `packages/core/src/unstable/cli-prompt/index.ts` exports
- [ ] 3.5 Run `pnpm typecheck` and fix any errors including `@effect/language-service` diagnostics
- [ ] 3.6 Run `pnpm lint` and fix any errors
- [ ] 3.7 Run `pnpm test` and fix any failures
- [ ] 3.8 Kill any vitest worker processes

## 4. Remove dependency and stale docs

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phases 2 and 3.

- [ ] 4.1 Remove `@clack/prompts` from `packages/core/package.json` and `packages/cli/package.json`; run `pnpm install` to update the lockfile
- [ ] 4.2 Update `AGENTS.md` and `CLAUDE.md` to describe the native prompt + custom renderer stack and remove the `@clack/prompts` entry from the external dependency tables
- [ ] 4.3 Run a repo-wide sweep for non-archive `@clack/prompts` references and clack-specific renderer wording; clean or replace any remaining references
- [ ] 4.4 Run `pnpm typecheck` and fix any errors including `@effect/language-service` diagnostics
- [ ] 4.5 Run `pnpm lint` and fix any errors
- [ ] 4.6 Run `pnpm test` and fix any failures
- [ ] 4.7 Run `pnpm test:e2e` and fix any failures
- [ ] 4.8 Kill any vitest worker processes

## 5. Final verification

> **Subagent:** Run this entire phase in a single subagent.

Depends on: All previous phases complete.

- [ ] 5.1 Run `pnpm run ci:affected` and fix any failures
- [ ] 5.2 Smoke-test at least one interactive text-mode CLI flow that exercises both `CliPrompt` and `CliRenderer` in the same session to confirm the output no longer mixes clack and Effect styles
- [ ] 5.3 Kill any vitest worker processes
