## Why

The new Ink-based TUI services (`packages/cli/src/tui/`) were introduced to replace clack. They're fully implemented but no consumers have been migrated yet. The `clack-effect` module and `@clack/prompts` dependency remain solely to serve existing handlers. Migrating consumers and removing clack eliminates the duplicate prompt infrastructure and completes the transition to a single, composable TUI layer.

## What Changes

- **BREAKING**: Replace `Clack` service dependency with individual TUI services (`Log`, `Spinner`, `Confirm`, `Select`, `Multiselect`) across all consumers:
  - `cli-commands/skills/install/handler.ts` — intro/outro, spinner, log, multiselect
  - `cli-commands/skills/install/select-skills.ts` — multiselect for skill selection
  - `cli-commands/skills/uninstall/handler.ts` — intro/outro, log
  - `cli-commands/init/handler.ts` — intro/outro, log
  - `cli-commands/skills/utils.ts` — select for extension ref disambiguation
  - `workspace/service.ts` — multiselect (agent selection), select (init choice), confirm (apply changes), log
  - `workspace/display-plan.ts` — log for plan display
  - `workspace/ensure-agents.ts` — log, confirm
- **BREAKING**: Replace `Clack` in `AppLayer` (runtime) with `TuiLive`
- **BREAKING**: Remove `clack-effect/` module entirely (service, errors, test helpers)
- **BREAKING**: Remove `@clack/prompts` dependency from `packages/cli`
- Replace `clack.intro()`/`clack.outro()` calls with `Log` equivalents (no direct TUI equivalent — use `Log.info` or `Log.success`)
- Migrate all test files from `makeClackTestLayer`/`MockClackConfig` to individual TUI test layers
- Import `PromptError`/`PromptCancelled` from `tui/errors.ts` instead of `clack-effect/errors.ts`

## Capabilities

### New Capabilities

_(none — TUI services already exist)_

### Modified Capabilities

_(none — no spec-level behavior changes; prompts behave the same, only the underlying service changes)_

## Impact

- **Runtime**: `AppLayer` type changes from `Clack` to TUI services; `runtime/index.ts` imports `TuiLive` instead of `ClackLive`
- **Workspace service**: `Workspace.layer` requires TUI services instead of `Clack`; `WorkspaceContextService.resolvePlan` error types switch to `tui/errors.ts`
- **Tests**: All handler and workspace tests need updated layers (individual TUI test layers instead of `makeClackTestLayer`)
- **Dependencies**: `@clack/prompts` removed from `packages/cli/package.json`
- **Deleted code**: `packages/cli/src/clack-effect/` directory (service.ts, errors.ts, test.ts, index.ts)
