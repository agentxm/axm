## Why

Diagnostic verbosity (`--verbose`, `--debug`) is resolved and threaded differently across the main CLI, spike CLI, and core runtime — two structurally identical types (`DiagnosticVerbosity`, `RenderAppErrorOptions`), manual `process.argv` scanning that duplicates what Effect CLI already parses, and an `appErrorRenderOptions` field threaded through four layers of options bags. The spike CLI declares verbose/debug global flags but silently ignores them. Unifying verbosity into the existing `CliFlags` service eliminates the duplication and gives both CLIs consistent behavior for free.

## What Changes

- **BREAKING**: Add `verbose` and `debug` boolean fields to `CliFlagsService` — resolved from Effect CLI global flag settings plus env vars (`AXM_VERBOSE`, `AXM_DEBUG`), with `--debug` implying `--verbose`
- **BREAKING**: Remove `appErrorRenderOptions` from `withCliErrorHandling`, `WithCliRuntimeOptions`, and `writeExpectedCliError` options — error rendering reads verbose/debug directly from the `verboseFlag`/`debugFlag` global flag settings already available in the fiber context
- Remove `DiagnosticVerbosity` interface and `resolveDiagnosticVerbosity()` from cli — redundant with flag resolution in `makeCliFlagsLayer`
- Remove `RenderAppErrorOptions` type from core — `renderAppError` accepts `{ verbose: boolean; debug: boolean }` inline
- Remove `classifyError` from cli — only used in tests, duplicates logic already in `withCliErrorHandling`
- `displayPlan` reads verbosity from `CliFlags` instead of calling `resolveDiagnosticVerbosity()` separately
- Main CLI's debug logger layer reads from `CliFlags` instead of a separately resolved `DiagnosticVerbosity`

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cli-flags`: Add `verbose` and `debug` to `CliFlagsService` interface with env var + flag resolution chain
- `app-error`: Remove `classifyError` requirement; error rendering verbosity is read from global flag settings by callers, not threaded through options bags

## Impact

- `@axm.sh/core`: `cli-flags` service interface gains two fields; `RenderAppErrorOptions` exported type removed; `appErrorRenderOptions` removed from `withCliErrorHandling` and `WithCliRuntimeOptions` options
- `@axm.sh/cli`: `DiagnosticVerbosity`, `resolveDiagnosticVerbosity()`, and `classifyError` deleted; `runtime.ts` simplified; `workspace/service.ts` and `workspace/display-plan.ts` read from `CliFlags`
- `@axm.sh/cli-spike`: No code changes needed — spike already wires `verboseFlag`/`debugFlag` as global flags and provides `CliFlags` via `makeFoundationLayer`; verbosity works automatically
- Tests: `classifyError` tests deleted; `CliFlagsTest` helper gains `verbose`/`debug` defaults
