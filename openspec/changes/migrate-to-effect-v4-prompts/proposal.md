## Why

The CLI spike wraps `@clack/prompts` via the `CliPrompt` service for all interactive prompts. Effect v4 now ships a native `Prompt` module (`effect/unstable/cli/Prompt`) that is fully effectful, composable, and type-safe — with built-in support for text, password, confirm, select, multiselect, autocomplete, file browsing, date/integer/float pickers, and combinators (`all`, `flatMap`, `map`). Using Effect v4 prompts directly removes a layer of indirection (token mapping, cancel-symbol translation, Clack option adapters) and aligns the spike with the standard library. This change validates the native approach in the spike before considering a broader migration of the primary CLI.

## What Changes

- **CLI spike prompt commands migrate to Effect v4 `Prompt`** — All 10 existing prompt demo commands (`text`, `password`, `confirm`, `select`, `multiselect`, `group-multiselect`, `select-key`, `autocomplete`, `autocomplete-multiselect`, `path`) switch from `CliPrompt` service calls to direct `Prompt.run(Prompt.xxx(...))` usage.
- **All prompt demos adopt pet store domain** — Every prompt demo command is re-themed to use the existing pet store example domain (pets, species, habitats, adoption, intake) instead of generic/unrelated scenarios (colors, fruits, timezones, packages). This gives the spike a cohesive narrative and makes the demos feel like a real application rather than disconnected widget showcases.
- **New demo commands for Effect v4-only prompt types** — Add demo commands showcasing prompt types that have no `CliPrompt` equivalent, all using pet store scenarios: `integer` (e.g., pet age in months with min/max bounds), `date` (e.g., intake date with date picker), `toggle` (e.g., adoptable on/off switch), `list` (e.g., comma-separated pet tags), and `hidden` (e.g., admin authorization code).
- **Prompt composition demo** — Add a composition demo command (e.g., a "register pet" wizard) that uses `Prompt.all` to declaratively combine multiple prompts into a single form-like flow and `Prompt.flatMap` to show conditional branching where the next prompt depends on the previous answer.
- **CLI spike pet store commands migrate** — `intake.ts` and `adopt.ts` replace `CliPrompt.confirm` with `Prompt.confirm` and equivalent non-interactive helpers.
- **Custom complementary prompt module** — A new prompt module in `packages/cli-spike/` (following Effect v4 `Prompt` conventions — same `Handlers`/`Action` render-loop pattern) provides prompt types that Effect v4 lacks but the spike requires: `selectKey`, `groupMultiselect`, and `autocompleteMultiselect`.
- **Non-interactive helpers adapted** — `fromFlagOrPrompt` and `autoConfirm` are updated to work with `Prompt<A>` values instead of `CliPrompt` method calls. Non-interactive mode uses `Prompt.succeed(default)` for the bypass path and fails with `AppError("PROMPT_REQUIRED")` when no default is available.
- **PromptCancelled replaced by QuitError** — Effect v4 prompts fail with `Terminal.QuitError` on Ctrl+C. The spike runtime's error handling is updated to treat `QuitError` the same way it currently treats `PromptCancelled` (exit 0, no error message).
- **Spike runtime layer updated** — The foundation layer no longer needs to provide `CliPrompt`; instead it provides `Terminal.Terminal` (+ `FileSystem`, `Path` for the file prompt). The spike's `withRuntime` wrapper accepts `Effect<A, AppError | QuitError, R>`.
- **Documentation and skills updated** — Guides and skills that reference prompt patterns are updated to show Effect v4 native usage alongside the existing `CliPrompt` patterns (which remain canonical for the primary CLI).

## Capabilities

### New Capabilities

- `cli-spike-custom-prompts`: Complementary prompt module providing `selectKey`, `groupMultiselect`, and `autocompleteMultiselect` prompts built on the Effect v4 `Prompt` render-loop pattern (same `Handlers`/`Action`/`Environment` contracts as native prompts).

### Modified Capabilities

- None. The primary CLI and `CliPrompt` service are unchanged.

## Impact

### Packages Changed

- **packages/cli-spike/** — All prompt-using files migrated:
  - `src/root/prompts/*.ts` (10 existing + 6 new prompt demo commands)
  - `src/root/pets/intake.ts`, `src/root/pets/adopt.ts` (business logic prompts)
  - `src/runtime.ts` (layer wiring, error union)
  - `src/app.ts` (if runtime setup changes)
  - New: custom prompt module for gap-filling prompt types

### Packages Unchanged

- **packages/core/** — `CliPrompt` service, Clack wrappers, `PromptCancelled`, test helpers all retained as-is
- **packages/cli/** — No changes; continues using `CliPrompt`

### Documentation Updated

- `contributing/guides/cli-design.md` — Add Effect v4 prompt patterns alongside existing `CliPrompt` guidance
- `.claude/skills/cli-conventions/SKILL.md` — Add Effect v4 prompt examples for spike context

## Gap Analysis Summary

Existing spike prompt types mapped to Effect v4 coverage:

| Spike Usage               | Effect v4 Native                       | Strategy                                            |
| ------------------------- | -------------------------------------- | --------------------------------------------------- |
| `text`                    | `Prompt.text`                          | Direct replacement                                  |
| `password`                | `Prompt.password` (returns `Redacted`) | Direct replacement; unwrap `Redacted` at call sites |
| `confirm`                 | `Prompt.confirm`                       | Direct replacement                                  |
| `select`                  | `Prompt.select`                        | Direct replacement                                  |
| `multiselect`             | `Prompt.multiSelect`                   | Direct replacement                                  |
| `autocomplete`            | `Prompt.autoComplete`                  | Direct replacement                                  |
| `path`                    | `Prompt.file`                          | Direct replacement (richer — interactive browser)   |
| `selectKey`               | **None**                               | Custom prompt module                                |
| `groupMultiselect`        | **None**                               | Custom prompt module                                |
| `autocompleteMultiselect` | **None**                               | Custom prompt module                                |

New Effect v4 prompt types to demonstrate (no CliPrompt equivalent):

| Prompt Type | Effect v4 Native                | Demo Purpose                                                                 |
| ----------- | ------------------------------- | ---------------------------------------------------------------------------- |
| `integer`   | `Prompt.integer`                | Constrained numeric input with min/max bounds, arrow-key increment/decrement |
| `date`      | `Prompt.date`                   | Interactive date picker with cursor navigation and i18n locale support       |
| `toggle`    | `Prompt.toggle`                 | On/off switch with left/right arrows and custom labels                       |
| `list`      | `Prompt.list`                   | Delimiter-separated text input parsed to `string[]`                          |
| `hidden`    | `Prompt.hidden`                 | Silent password input (no mask characters) — complements `password`          |
| composition | `Prompt.all` + `Prompt.flatMap` | Declarative multi-prompt forms and conditional branching flows               |

### Non-Functional Mapping

| Concern                | Current (CliPrompt)                  | Target (Effect v4)                                  |
| ---------------------- | ------------------------------------ | --------------------------------------------------- |
| Cancellation           | `PromptCancelled` error              | `Terminal.QuitError`                                |
| Non-interactive bypass | `guardedPrompt` + `fromFlagOrPrompt` | `Prompt.succeed(default)` + adapted helpers         |
| Validation             | Sync `(v) => string \| undefined`    | Effectful `(v) => Effect<T, string>`                |
| Password return type   | `string`                             | `Redacted` (prevents accidental logging)            |
| Test layer             | `makeTestPrompt` (response queues)   | `MockTerminal` (keystroke-level) or new test helper |
| Service dependency     | `CliPrompt` service                  | `Terminal` + `FileSystem` + `Path` services         |
