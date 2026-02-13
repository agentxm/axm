## Context

The CLI has two error boundaries today:

1. **`main.ts`** — catches rejected promises from yargs parsing via `Effect.runPromise(...).catch()`
2. **`runtime/index.ts` `run()`** — catches all Effect errors via `Effect.catchAll`, prints with `console.error`, exits 1

Handlers define their own error types (`InstallError`, `ForkError`, `PublishError`, `UpdateError`) but three handlers (`init`, `list`, `uninstall`) let domain errors propagate untyped. Error messages are formatted eagerly with `formatError(what, details, howToFix)` and baked into `.message` strings. The runtime boundary has no structured rendering — it dumps whatever it catches.

Domain errors use inconsistent `cause` types: `cause: unknown`, `cause?: unknown`, and `cause: Option.Option<unknown>` (GitError, PromptError).

## Goals / Non-Goals

**Goals:**

- Single `CliError` wrapper type as the only expected error at the runtime boundary
- Structured error details (what, details, howToFix, code) on `CliError`, formatted only at the boundary
- Consistent `cause: unknown` across all domain errors
- `PromptCancelled` handled as a clean exit (code 0)
- Unhandled errors treated as defects with diagnostic output
- Stable error codes for scripting/automation
- `Effect.withSpan` on key operations for tracing context

**Non-Goals:**

- JSON error output mode (future work, but `CliError` structure enables it)
- Internationalization of error messages
- Error recovery/retry at the runtime boundary (handlers own recovery)
- Changing domain error types beyond standardizing `cause`

## Decisions

### 1. `CliError` lives in `packages/cli/src/cli-error/`

New feature folder with `cli-error.ts` (type + factory helpers) and `render.ts` (formatting logic). Follows the co-location convention — it's a self-contained feature, not a utility.

**Alternative considered:** Put it in `runtime/`. Rejected because rendering and the error type are reusable concerns, and `runtime/` is about layer wiring.

### 2. `CliError` shape

```typescript
class CliError extends Data.TaggedError("CliError")<{
  readonly code: string;
  readonly what: string;
  readonly details: ReadonlyArray<string>;
  readonly howToFix: Option.Option<string>;
  readonly cause: unknown;
}> {}
```

- `code` — stable identifier like `WORKSPACE_NOT_INIT`, `INVALID_SOURCE`, `INSTALL_FAILED`
- `what` — one-line description of what went wrong
- `details` — context lines (what was tried, inputs, etc.)
- `howToFix` — optional recovery guidance
- `cause` — original domain error for debugging

`details` is required (empty array if none) to avoid optional field ambiguity. `howToFix` uses `Option` per codebase convention for optional values.

**Alternative considered:** Extending existing handler errors to carry these fields. Rejected because it couples domain errors to presentation and doesn't solve the boundary type problem.

### 3. Error codes are plain strings, not an enum

Error codes like `WORKSPACE_NOT_INIT` are string constants defined alongside the `mapError` call that creates the `CliError`. No central enum — each handler defines its codes locally.

**Rationale:** Codes are a presentation concern owned by the handler. A central enum would create coupling and grow with every command. Codes are documented in output only — no programmatic matching against them.

**Alternative considered:** Union type or enum of all codes. Rejected for the coupling reason above. Codes are for humans and scripts parsing stderr, not for internal branching.

### 4. Runtime boundary catches `CliError | PromptCancelled` only

```typescript
program.pipe(
  Effect.catchTag("PromptCancelled", () => Effect.sync(() => process.exit(0))),
  Effect.catchTag("CliError", (error) =>
    Effect.sync(() => {
      renderCliError(error);
      process.exit(1);
    }),
  ),
  // Anything else is a defect — should never happen
  Effect.catchAll((error) =>
    Effect.sync(() => {
      renderDefect(error);
      process.exit(2);
    }),
  ),
);
```

Exit codes: 0 for cancellation, 1 for expected errors, 2 for defects.

The `catchAll` fallback remains as a safety net but logs a "this is a bug" diagnostic. In a correct program it never fires.

**Alternative considered:** Using `Effect.catchAllDefect` separately. Rejected because untyped errors in the E channel (from handlers that forgot to map) should also be treated as defects, and `catchAll` after the two `catchTag` calls handles exactly that.

### 5. Handlers are responsible for the final `mapError` to `CliError`

Each handler's top-level Effect maps its domain errors to `CliError`. This happens in the handler, not in the command or runtime. The handler has the most context to write a useful error message.

Handlers that currently have no error handling (`init`, `list`, `uninstall`) need a `mapError` added. Handlers with existing local error types (`InstallError`, `ForkError`, etc.) replace them — `CliError` subsumes their role.

### 6. Remove `formatError` and `formatEmptyResolutionError`

These are replaced by `CliError` construction + `renderCliError`. The `renderCliError` function in `cli-error/render.ts` produces the same `✗` format but from structured data.

### 7. Standardize `cause: unknown` on all domain errors

- `GitError`: change `cause: Option.Option<unknown>` → `cause: unknown`
- `PromptError`: change `cause: Option.Option<unknown>` → `cause: unknown`
- `WorkspaceInitializationError`: change `cause?: unknown` → `cause: unknown`

All callers updated to pass `undefined` instead of `Option.none()`.

### 8. `Effect.withSpan` on key operations

Add spans to: source resolution, git operations, plan execution, filesystem operations in handlers. These don't change behavior — they add trace context that `renderDefect` can include.

Not every function gets a span. Focus on operations that cross service boundaries or involve I/O.

## Risks / Trade-offs

- **Migration breadth** — Every handler needs a `mapError` to `CliError`. Risk of missing one. → Mitigation: Effect's type system will show unhandled errors in `run()`'s type signature. The `catchAll` defect fallback catches anything missed at runtime.
- **Handler error types removed** — `InstallError`, `ForkError`, `PublishError`, `UpdateError` go away. Tests that catch these types need updating. → Mitigation: Tests should assert on behavior (output, exit code), not internal error types.
- **Error code stability** — Codes are strings with no compile-time validation. Typos possible. → Mitigation: Codes are local to the handler, short, and reviewed in PRs. Low risk.
- **Span overhead** — `Effect.withSpan` adds minimal overhead but increases code surface. → Mitigation: Only add to I/O boundaries, not pure functions.
