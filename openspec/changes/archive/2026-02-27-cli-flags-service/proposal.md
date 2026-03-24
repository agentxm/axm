## Why

CLI behavior flags (`--yes`, `--non-interactive`, `--force`, `--preview`) are defined per-command, resolved in multiple places, and passed through two independent channels (handler args and workspace options). This causes duplicated resolution logic, inconsistent defaults (e.g., `init` sets `default: false` on `--non-interactive` which defeats CI/TTY auto-detection), and fragile prompt guarding where every call site must manually check `nonInteractive` before calling a Clack prompt.

## What Changes

- **BREAKING**: Introduce a `CliFlags` Effect service that resolves `--yes`, `--non-interactive`, `--force`, and `--preview` once at the `run()` boundary. All handlers and services read from `CliFlags` instead of receiving raw flag values.
- **BREAKING**: Define `--yes`, `--force`, and `--preview` as global flags in `main.ts` (alongside the existing `--non-interactive`). Remove per-command definitions of these flags.
- **BREAKING**: Remove behavior flags (`yes`, `nonInteractive`, `preview`, `force`) from `WorkspaceContextOptions`. Workspace service depends on `CliFlags` instead.
- **BREAKING**: `ClackPromptService` depends on `CliFlags` and fails fast with an `AppError` (`PROMPT_IN_NON_INTERACTIVE`) if any prompt method is called when `nonInteractive` is true. This catches missed guards at development time rather than hanging in CI.
- Remove duplicated `nonInteractive` resolution logic from `command-actions.ts` files. Single resolution lives in the `CliFlags` layer constructor.
- Handler arg types that currently carry `nonInteractive: Option<boolean>` switch to reading the resolved `boolean` from `CliFlags`.

## Capabilities

### New Capabilities

- `cli-flags`: The `CliFlags` Effect service — resolution chain (explicit flag → CI env → TTY detection), service interface, layer construction, and consumption patterns.

### Modified Capabilities

- `cli`: Global flag definitions change — `--yes`, `--force`, `--preview` become global; `--non-interactive` resolution semantics are clarified.
- `plan-confirm-apply`: `resolvePlan` reads `preview`, `yes`, `nonInteractive`, and `force` from `CliFlags` service instead of from `WorkspaceContextOptions`.

## Impact

- `packages/cli/src/runtime/index.ts` — `run()` constructs `CliFlags` layer from raw argv values and provides it to the program.
- `packages/cli/src/workspace/service.ts` — `WorkspaceContextOptions` loses behavior flags; `make()` yields `CliFlags` instead of resolving independently.
- `packages/cli/src/main.ts` — Global flag definitions for `--yes`, `--force`, `--preview`.
- `packages/cli/src/clack-effect/prompt/service.ts` — Prompt service depends on `CliFlags` for fail-fast guard.
- `packages/cli/src/utils/tty.ts` — `isInteractive()` remains but is only called by `CliFlags` layer constructor.
- All command `command.ts` files — Remove per-command `--yes`, `--force`, `--preview`, `--non-interactive` option definitions.
- All command handler types — Remove `nonInteractive`, `yes`, `force` fields that duplicate `CliFlags`.
- All `command-actions.ts` files — Remove local `nonInteractive` resolution logic.
