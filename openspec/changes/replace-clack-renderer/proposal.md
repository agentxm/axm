## Why

The CLI now uses Effect v4's native `Prompt` module for interactive prompts, but the `CliRenderer` still delegates all stderr chrome (log lines, spinners, progress bars, boxes) to `@clack/prompts`. These two libraries have fundamentally different visual languages — Effect prompts use a flat, symbol-prefixed inline style (`? message ›`) while clack uses vertical guide bars (`│ message`). Mixing them produces visually inconsistent output. Removing the clack dependency and building renderer chrome that complements Effect's prompt aesthetic gives us a cohesive CLI experience and eliminates an external dependency.

## What Changes

- **BREAKING**: Replace all `@clack/prompts` rendering in `InteractiveRenderer` with custom implementations built on Effect's ANSI primitives
- **BREAKING**: Drop the `│` vertical guide bar visual style in favor of a flat, symbol-prefixed style that matches Effect v4 Prompt output
- Remove `@clack/prompts` dependency from `packages/core` and `packages/cli`
- Remove the legacy `cli-prompt-interactive.ts` clack prompt adapter and related files (`clack-prompt-options.ts`)
- Implement custom spinner, progress bar, log line, note, and box rendering using `effect/unstable/cli/internal/ansi` primitives
- Update table, detail, and tree formatters to drop the `│` prefix

## Capabilities

### New Capabilities

- `cli-renderer-chrome`: Custom stderr chrome (log lines, spinners, progress, notes, boxes) that visually complements Effect v4 Prompt style — flat, symbol-prefixed, minimal aesthetic

### Modified Capabilities

_(none — existing TUI specs cover prompt behavior, not renderer chrome)_

## Impact

- `packages/core/src/unstable/cli-renderer/cli-renderer-interactive.ts` — full rewrite of the implementation
- `packages/core/src/unstable/cli-renderer/cli-renderer-interactive.test.ts` — tests updated for new rendering
- `packages/core/src/unstable/cli-prompt/` — remove clack adapter files (`cli-prompt-interactive.ts`, `clack-prompt-options.ts`, related tests)
- `packages/core/package.json` — remove `@clack/prompts` dependency
- `packages/cli/package.json` — remove `@clack/prompts` dependency
- `packages/core/src/unstable/cli-renderer/cli-renderer.ts` — service interface unchanged (implementations change, not the contract)
- `CLAUDE.md` — update CLI UI entry from `@clack/prompts` to custom renderer
- External dependency table in `CLAUDE.md` — remove clack entry
