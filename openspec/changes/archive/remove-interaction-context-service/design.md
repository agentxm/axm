## Context

The CLI currently has three ways to use clack prompts:

1. **`Clack` service** (`clack-effect/service.ts`) — Effect-wrapped, injectable, testable
2. **`InteractionContext` service** — Wrapper around `Clack` with `p` property, plus `Option` in `OperationContext`
3. **Direct imports** — `import * as p from "@clack/prompts"` in handlers and utilities

The `InteractionContext` was added to provide optional interactivity via `Option<InteractionContext>` in `OperationContext`. However, this adds complexity without clear benefit—commands either need prompts or they don't, and the `Clack` service already handles this cleanly through Effect's dependency system.

**Current usage:**

- `workspace-context/service.ts` — Uses `InteractionContext` correctly
- `init/handler.ts` — Declares `InteractionContext` but uses direct `p.*` calls
- `skills/install/handler.ts` — Uses utility functions + direct `p.*` calls
- `skills/uninstall/handler.ts` — Uses direct `p.*` calls
- `utils/prompts.ts` — Effect functions wrapping direct clack calls
- `utils/spinner.ts` — Synchronous wrapper around `p.spinner()`

## Goals / Non-Goals

**Goals:**

- Single pattern for CLI prompts: inject `Clack` service, use its methods
- Remove `InteractionContext` abstraction layer
- Delete utility helpers that duplicate `Clack` functionality
- All handlers testable via `makeClackTestLayer()`

**Non-Goals:**

- Adding new prompt capabilities
- Changing the `Clack` service interface
- Supporting non-interactive mode detection (handle at command layer)

## Decisions

### Decision 1: Remove `InteractionContext` entirely

**Choice:** Delete the service rather than deprecate.

**Rationale:** The abstraction provides no value over using `Clack` directly. The `p` property just exposes `ClackService`, and the `Option` wrapper in `OperationContext` conflates "is terminal interactive" with "does this command need prompts"—these are separate concerns.

**Alternative considered:** Keep `InteractionContext` but have it extend/delegate to `Clack`. Rejected because it's still unnecessary indirection.

### Decision 2: Handlers depend on `Clack` directly

**Choice:** Handlers that need prompts include `Clack` in their Effect requirements.

```typescript
// Before
const handleInit = (...): Effect.Effect<void, InitError, InteractionContext> =>

// After
const handleInit = (...): Effect.Effect<void, InitError, Clack> =>
```

**Rationale:** This is explicit—you can see from the type signature whether a handler uses prompts. The `Clack` service is already designed for this.

### Decision 3: Delete utility helpers, use `Clack` methods

**Choice:** Remove `utils/prompts.ts` and `utils/spinner.ts`. Use `Clack.confirm()`, `Clack.select()`, `Clack.multiselect()`, `Clack.spinner()` directly.

**Rationale:** The utility functions duplicate what `Clack` already provides. They handle cancellation by calling `p.cancel()` and returning `Effect.fail()`, which the `Clack` service already does with `PromptCancelled`.

**Migration for cancel handling:** The utilities call `p.cancel(message)` before failing. In `Clack`, cancellation returns `PromptCancelled`. Handlers can catch this and call `clack.outro()` or let it propagate.

### Decision 4: Test migration to `makeClackTestLayer()`

**Choice:** Replace `vi.mock("@clack/prompts")` with Effect test layers.

```typescript
// Before
vi.mock("@clack/prompts", () => ({ confirm: vi.fn() }));

// After
const TestClack = makeClackTestLayer({
  confirm: () => Effect.succeed(true),
});
```

**Rationale:** Effect test layers are composable and type-safe. They also test the actual code path through the service.

## Risks / Trade-offs

**[Risk] Large refactor touching multiple handlers** → Mitigated by clear pattern: replace `p.*` with `yield* Clack` then `clack.*`. Each handler can be updated independently.

**[Risk] Cancel behavior changes** → The utilities call `p.cancel(message)` to show a message. `Clack` returns `PromptCancelled` error. Handlers should catch this at the top level and call `clack.outro("Cancelled")` if needed. This is actually cleaner—error handling is explicit.

**[Risk] Tests may be more verbose** → `makeClackTestLayer()` requires defining mock implementations. But this is better than magic `vi.mock()` that can silently break.

**[Trade-off] Losing `Option<InteractionContext>` pattern** → Commands that want to support both interactive and non-interactive modes can use `Effect.catchTag("PromptCancelled", ...)` or check `process.stdin.isTTY` before prompting. This is a command-level concern, not a service-level one.

## Migration Plan

1. **Update `workspace-context`** — Change from `InteractionContext` to `Clack`
2. **Refactor handlers** — One at a time: `init`, `install`, `uninstall`
3. **Delete utilities** — `prompts.ts`, `spinner.ts` and their tests
4. **Delete `InteractionContext`** — Service folder and spec
5. **Verify** — `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`

No rollback needed—this is a code simplification with no runtime behavior change for users.
