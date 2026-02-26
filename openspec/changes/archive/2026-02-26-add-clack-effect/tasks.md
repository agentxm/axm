## 1. Prerequisites

> **Subagent:** Run this entire phase in a single subagent.

Add the `@clack/prompts` dependency and move `PromptCancelled` to a shared location so both `tui/` and `clack-effect/` can use it without coupling. **No dependencies — start here.**

- [x] 1.1 Add `@clack/prompts` as a dependency in `packages/cli/package.json` and run `pnpm install`
- [x] 1.2 Create `packages/cli/src/prompt-cancelled.ts` — move the `PromptCancelled` class definition from `tui/errors.ts` to this new file
- [x] 1.3 Update `tui/errors.ts` to re-export `PromptCancelled` from `@/prompt-cancelled` — existing consumer imports (`from "@/tui"`) must continue to work unchanged
- [x] 1.4 Verify no import paths broke: `pnpm typecheck`
- [x] 1.5 Run `pnpm test` to confirm existing tests pass
- [x] 1.6 Kill any remaining vitest worker processes

## 2. ClackPrompt Service

> **Subagent:** Run this entire phase in a single subagent.

Implement the `ClackPrompt` service wrapping all interactive prompts (`text`, `password`, `confirm`, `select`, `multiselect`, `groupMultiselect`, `selectKey`, `autocomplete`, `autocompleteMultiselect`, `path`). **Depends on: Phase 1.**

- [x]2.1 Define config types in `clack-effect/prompt/types.ts` — non-generic (`ClackTextConfig`, `ClackPasswordConfig`, `ClackConfirmConfig`, `ClackPathConfig`) and generic (`ClackSelectConfig<V>`, `ClackMultiselectConfig<V>`, `ClackGroupMultiselectConfig<V>`, `ClackSelectKeyConfig<V>`, `ClackAutocompleteConfig<V>`, `ClackAutocompleteMultiselectConfig<V>`). Omit `CommonOptions` fields.
- [x]2.2 Write tests for `ClackPrompt` service: text returns string value, confirm returns boolean, select returns typed `V`, multiselect returns `ReadonlyArray<V>`, cancellation maps to `PromptCancelled`, render failure maps to `CliError` with code `PROMPT_RENDER_FAILED`
- [x]2.3 Implement `wrapPrompt` (private thunk-based utility) and `ClackPrompt` service tag, interface, and `ClackPromptLive` layer in `clack-effect/prompt/service.ts`
- [x]2.4 Write `makeClackPromptTestLayer` in `clack-effect/prompt/test.ts` — call-recording mock with configurable behaviors (return value or cancel), following `tui/confirm/test.ts` pattern
- [x]2.5 Create `clack-effect/prompt/index.ts` barrel
- [x]2.6 Typecheck `packages/cli`
- [x]2.7 Run `pnpm test` for clack-effect tests, fix any failures
- [x]2.8 Kill any remaining vitest worker processes

## 3. ClackLog, ClackSpinner, ClackProgress Services

> **Subagent:** Run this entire phase in a single subagent.

Implement display, spinner, and progress services. ClackProgress extends ClackSpinner's handle type. **Depends on: Phase 1. Can run in parallel with Phase 2.**

- [x]3.1 Write tests for `ClackLog` — `info`, `warn`, `error`, `success`, `step`, `message`, `intro`, `outro`, `cancel`, `note`, `box` all call through to Clack and return `Effect<void>`
- [x]3.2 Implement `ClackLog` service tag, interface, and `ClackLogLive` layer in `clack-effect/log/service.ts` — all methods use `Effect.sync`
- [x]3.3 Write `makeClackLogTestLayer` in `clack-effect/log/test.ts` — call-recording mock
- [x]3.4 Create `clack-effect/log/index.ts` barrel
- [x]3.5 Define `ClackSpinnerHandle` interface in `clack-effect/spinner/types.ts` — `stop`, `message`, `cancel`, `error`, `clear` methods returning `Effect<void>`
- [x]3.6 Write tests for `ClackSpinner` — `start` returns handle, `withSpinner` calls `handle.stop(stopMessage)` on success, `handle.error(message)` on failure, `handle.cancel()` on interruption
- [x]3.7 Implement `ClackSpinner` service tag, interface, and `ClackSpinnerLive` layer in `clack-effect/spinner/service.ts` — `withSpinner` uses `Effect.matchCauseEffect` for outcome-based styling
- [x]3.8 Write `makeClackSpinnerTestLayer` in `clack-effect/spinner/test.ts` — call-recording mock with handle that records method calls
- [x]3.9 Create `clack-effect/spinner/index.ts` barrel
- [x]3.10 Define `ClackProgressHandle` interface (extends `ClackSpinnerHandle` with `advance`) and `ClackProgressConfig` in `clack-effect/progress/types.ts`
- [x]3.11 Write tests for `ClackProgress` — `start` returns handle with `advance`, `withProgress` mirrors `withSpinner` outcome-based styling
- [x]3.12 Implement `ClackProgress` service tag, interface, and `ClackProgressLive` layer in `clack-effect/progress/service.ts`
- [x]3.13 Write `makeClackProgressTestLayer` in `clack-effect/progress/test.ts`
- [x]3.14 Create `clack-effect/progress/index.ts` barrel
- [x]3.15 Typecheck `packages/cli`
- [x]3.16 Run `pnpm test` for clack-effect tests, fix any failures
- [x]3.17 Kill any remaining vitest worker processes

## 4. ClackTaskLog and ClackStream Services

> **Subagent:** Run this entire phase in a single subagent.

Implement handle-based task log and Stream-only streaming services. **Depends on: Phase 1. Can run in parallel with Phases 2 and 3.**

- [x]4.1 Define `ClackTaskLogConfig`, `ClackTaskLogHandle`, `ClackTaskLogGroupHandle` in `clack-effect/task-log/types.ts`
- [x]4.2 Write tests for `ClackTaskLog` — `start` returns handle, `handle.group` returns group handle, group `message`/`error`/`success` work, handle `message`/`error`/`success` work
- [x]4.3 Implement `ClackTaskLog` service tag, interface, and `ClackTaskLogLive` layer in `clack-effect/task-log/service.ts`
- [x]4.4 Write `makeClackTaskLogTestLayer` in `clack-effect/task-log/test.ts`
- [x]4.5 Create `clack-effect/task-log/index.ts` barrel
- [x]4.6 Write tests for `ClackStream` — Stream-only API, `Stream.make` literals work, Stream errors propagate as `CliError | E`, verify all `stream.*` method variants (`info`, `warn`, `error`, `success`, `step`, `message`)
- [x]4.7 Implement `ClackStream` service tag, interface, and `ClackStreamLive` layer in `clack-effect/stream/service.ts` — convert `Stream<string, E, R>` to `AsyncIterable` via `Stream.toReadableStream` before forwarding to Clack
- [x]4.8 Write `makeClackStreamTestLayer` in `clack-effect/stream/test.ts`
- [x]4.9 Create `clack-effect/stream/index.ts` barrel
- [x]4.10 Typecheck `packages/cli`
- [x]4.11 Run `pnpm test` for clack-effect tests, fix any failures
- [x]4.12 Kill any remaining vitest worker processes

## 5. runTasks, ClackLive Layer, and Barrel

> **Subagent:** Run this entire phase in a single subagent.

Create the Effect-native `runTasks` function, the merged `ClackLive` layer, and the top-level barrel. **Depends on: Phases 2, 3, 4.**

- [x]5.1 Write tests for `runTasks` — sequential execution order, task errors propagate through Effect channel, `enabled: false` tasks are skipped, spinner auto-cleanup via `withSpinner`, task return value used as stop message (falls back to title when void)
- [x]5.2 Implement `runTasks` function in `clack-effect/tasks.ts` — plain function (not a service), requires `ClackSpinner` in `R`
- [x]5.3 Create merged `ClackLive` layer in `clack-effect/index.ts` — `Layer.mergeAll(ClackPromptLive, ClackLogLive, ClackSpinnerLive, ClackProgressLive, ClackTaskLogLive, ClackStreamLive)`
- [x]5.4 Export all services, types, layers, test helpers, and `runTasks` from `clack-effect/index.ts` barrel
- [x]5.5 Typecheck `packages/cli`
- [x]5.6 Run `pnpm test` for clack-effect tests, fix any failures
- [x]5.7 Kill any remaining vitest worker processes

## 6. Final Verification

> **Subagent:** Run this entire phase in a single subagent.

Full verification pass. **Depends on: all previous phases.**

- [x]6.1 Run `pnpm typecheck` — all packages must pass with zero errors
- [x]6.2 Run `pnpm lint` — all packages must pass with zero errors
- [x]6.3 Run `pnpm test` — all tests must pass (existing tui/ tests unaffected, new clack-effect/ tests pass)
- [x]6.4 Run `pnpm test:e2e` — all e2e tests must pass
- [x]6.5 Verify each service has: service tag, interface, live layer, test layer with call-recording mock
- [x]6.6 Verify `PromptCancelled` import from `@/tui` still works (re-export intact)
- [x]6.7 Verify `ClackLive` provides all 6 services
- [x]6.8 Kill any remaining vitest worker processes
