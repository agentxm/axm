## Why

The `InteractionContext` service adds an unnecessary layer of indirection. The `Clack` service in `clack-effect/` already provides a well-designed Effect-wrapped interface for CLI prompts. Having two abstractions (`InteractionContext` wrapping `Clack`) creates confusion and the codebase currently has mixed patterns—some code uses `InteractionContext`, some uses direct `@clack/prompts` imports, and some uses utility helpers. Consolidating on the single `Clack` service simplifies the architecture.

## What Changes

- **BREAKING**: Remove `InteractionContext` service (`packages/cli/src/services/interaction-context/`)
- **BREAKING**: Remove `interaction` field from `OperationContext`
- **BREAKING**: Remove clack utility helpers (`packages/cli/src/utils/prompts.ts`, `packages/cli/src/utils/spinner.ts`)
- Refactor `init` handler to use `Clack` service directly
- Refactor `skills install` handler to use `Clack` service directly
- Refactor `skills uninstall` handler to use `Clack` service directly
- Refactor `workspace-context` service to use `Clack` service directly
- Update all tests to use `makeClackTestLayer()` instead of `vi.mock("@clack/prompts")`

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cli-interaction-context`: **REMOVED** — This spec will be deleted as the capability is being removed entirely.

## Impact

**Code affected:**

- `packages/cli/src/services/interaction-context/` — deleted
- `packages/cli/src/services/operation-context/` — remove `interaction` field
- `packages/cli/src/services/workspace-context/` — use Clack directly
- `packages/cli/src/utils/prompts.ts` — deleted
- `packages/cli/src/utils/spinner.ts` — deleted
- `packages/cli/src/commands/init/` — use Clack service
- `packages/cli/src/commands/skills/install/` — use Clack service
- `packages/cli/src/commands/skills/uninstall/` — use Clack service

**Tests affected:**

- `packages/cli/src/utils/prompts.test.ts` — deleted
- `packages/cli/src/utils/spinner.test.ts` — deleted
- Handler tests using `InteractionContext` mocks — update to use Clack test layers

**Dependencies:**

- Commands requiring prompts will depend on `Clack` service in their Effect signature
- No external dependency changes
