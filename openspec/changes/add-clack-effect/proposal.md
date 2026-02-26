## Why

The CLI currently uses Ink (React-based terminal UI) for all interactive prompts and display. Ink brings a heavy dependency chain (React, Yoga layout engine) and requires `.tsx` files for simple prompts. We want to migrate to `@clack/prompts` — a lightweight, beautiful prompt library with no React dependency. This change adds `@clack/prompts` as a dependency and creates an Effect-wrapped module so handlers can adopt Clack incrementally without touching existing Ink-based code.

## What Changes

- Add `@clack/prompts` as a dependency of `@axm.sh/cli`
- Create a new `clack-effect` module at `packages/cli/src/clack-effect/` that wraps the full `@clack/prompts` API in Effect services
- Wraps all interactive prompts: `text`, `password`, `confirm`, `select`, `multiselect`, `groupMultiselect`, `selectKey`, `autocomplete`, `autocompleteMultiselect`, `path`
- Wraps prompt grouping: `group`
- Wraps display functions: `log`, `note`, `box`, `stream`, `intro`, `outro`, `cancel`
- Wraps progress primitives: `spinner`, `progress`, `tasks`, `taskLog`
- Maps Clack's cancel symbol to the existing `PromptCancelled` error type
- Provides Effect `Context.Tag` services with live layers and test layers

## Capabilities

### New Capabilities

- `clack-effect`: Effect service wrappers for the full `@clack/prompts` API — interactive prompts, display/logging, spinners, progress, and prompt grouping

### Modified Capabilities

_(none — this is additive, no existing code changes)_

## Impact

- **Dependencies**: Adds `@clack/prompts` to `packages/cli/package.json`
- **New code**: `packages/cli/src/clack-effect/` module with services, types, layers, and tests
- **Existing code**: No changes — existing `tui/` module and all handlers remain untouched
- **Future**: Enables incremental migration of handlers from `tui/` (Ink) to `clack-effect/` (Clack)
