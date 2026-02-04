## Why

CLI commands sometimes run interactively (with user prompts) and sometimes non-interactively (CI, piped input, `--yes` flags). Currently, handlers must check multiple conditions to determine if interaction is available. An `InteractionContext` service provides a clear abstraction for interactive capabilities, and exposing it as `Option` in `OperationContext` lets handlers cleanly branch on interactivity.

## What Changes

- Add `packages/cli/src/services/interaction-context/` folder with `InteractionContext` service
- `InteractionContext` wraps and exposes the `Clack` service for prompts, logging, and spinners
- Modify `OperationContext` to include `interaction: Option<InteractionContext>`
- Handlers access interactive features through `OperationContext.interaction` when available

## Capabilities

### New Capabilities

- `cli-interaction-context`: Service providing optional interactive CLI capabilities (prompts, spinners, logging) through a unified interface

### Modified Capabilities

- `cli-operation-context`: Add `interaction: Option<InteractionContext>` field to expose interactive capabilities

## Impact

- `packages/cli/src/services/interaction-context/` — new service folder
- `packages/cli/src/services/operation-context.ts` — add optional interaction field
- Existing handlers using `Clack` directly will migrate to use `InteractionContext` via `OperationContext`
- Test layers need updating to provide/mock `InteractionContext`
