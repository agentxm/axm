> **Scope:** This change replaces clack-backed renderer chrome in `InteractiveRenderer`. Migrating the primary CLI off `CliPrompt` or removing `@clack/prompts` from prompt-layer code is out of scope here.

## 1. ANSI chrome primitives

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

## 3. Renderer docs and verification

- [ ] 3.1 Update `AGENTS.md` and `CLAUDE.md` so the CLI UI description reflects the new custom renderer without claiming the primary CLI prompt layer has been removed
- [ ] 3.2 Run a repo-wide sweep for non-archive clack-specific renderer wording in docs and tests; update only references made stale by the renderer replacement
- [ ] 3.3 Run `pnpm typecheck` and fix any errors including `@effect/language-service` diagnostics
- [ ] 3.4 Run `pnpm lint` and fix any errors
- [ ] 3.5 Run `pnpm test` and fix any failures
- [ ] 3.6 Run `pnpm test:e2e` and fix any failures
- [ ] 3.7 Kill any vitest worker processes

## 4. Final verification

- [ ] 4.1 Run `pnpm run ci:affected` and fix any failures
- [ ] 4.2 Smoke-test at least one interactive text-mode CLI flow that exercises both `CliPrompt` and `CliRenderer` in the same session to confirm the output no longer mixes clack and Effect styles
- [ ] 4.3 Kill any vitest worker processes
