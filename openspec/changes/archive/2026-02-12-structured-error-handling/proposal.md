## Why

CLI error output is inconsistent and lacks structure. The runtime boundary dumps raw error objects, errors encode their presentation eagerly as strings (preventing programmatic inspection or alternative renderings), cause types vary between `unknown` and `Option<unknown>`, user cancellation prints as an error, and there are no stable error codes for scripting. These gaps make errors harder to debug, test, and consume programmatically.

## What Changes

- **BREAKING**: Introduce an `AppError` wrapper as the single error type at the runtime boundary — handlers convert domain errors to `AppError` carrying structured details (`what`, `details`, `howToFix`, error code). Anything else reaching the boundary is treated as a defect.
- Add a structured error renderer at the runtime boundary that formats `AppError` consistently, with verbose cause chain output for debugging
- **BREAKING**: Remove `formatError(what, details, howToFix)` string builder — replaced by structured fields on `AppError`
- **BREAKING**: Standardize all domain error `cause` fields to `cause: unknown` (remove `Option<unknown>` variant)
- Add stable, user-facing error codes (e.g., `AXM_WORKSPACE_NOT_INIT`) printed in output
- Handle `PromptCancelled` at the runtime boundary as a clean exit (code 0, no error output)
- Add `Effect.withSpan` annotations on key operations for structured tracing (visible in verbose/debug output)

## Capabilities

### New Capabilities

- `cli-error`: `AppError` wrapper type, error renderer, error codes, structured details — the complete error boundary contract

### Modified Capabilities

- `cli`: Runtime boundary catches `AppError | PromptCancelled` only; unhandled errors are defects
- `tui-spinner`: Ensure spinner stops cleanly on all error paths before error rendering

## Impact

- `packages/cli/src/runtime/` — `AppError` type, error renderer, `PromptCancelled` handling
- `packages/cli/src/utils/errors.ts` — remove `formatError`, replace with `AppError` constructor
- All handlers — add final `mapError` converting domain errors to `AppError`
- All domain error classes — standardize `cause: unknown`, remove `Option<unknown>` variants
- `packages/cli/src/git/errors.ts` — change `cause: Option.Option<unknown>` to `cause: unknown`
