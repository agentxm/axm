## Context

Diagnostic verbosity is currently resolved and threaded through two independent paths:

1. **Main CLI** (`packages/cli/src/runtime.ts`): `resolveDiagnosticVerbosity()` manually scans `process.argv` for `--verbose`/`--debug` and checks `AXM_VERBOSE`/`AXM_DEBUG` env vars. The result is a `DiagnosticVerbosity` value (`{ verbose, debug }`) that is threaded as `appErrorRenderOptions` through `withCliErrorHandling` → `writeExpectedCliError` → `renderAppError`, and also used to construct the debug logger layer. A second call to `resolveDiagnosticVerbosity()` in `workspace/service.ts` resolves verbosity independently for `displayPlan`.

2. **Core runtime** (`packages/core/src/unstable/cli-runtime/runtime-envelope.ts`): Accepts `appErrorRenderOptions?: RenderAppErrorOptions` in multiple options interfaces and threads it to `renderAppError`. `RenderAppErrorOptions` is structurally identical to `DiagnosticVerbosity`.

3. **Spike CLI** (`packages/cli-spike/src/runtime.ts`): Declares `verboseFlag`/`debugFlag` as global flags but never reads their values. Errors always render with `{ verbose: false, debug: false }`.

Meanwhile, the `verboseFlag` and `debugFlag` are already parsed by Effect CLI's `GlobalFlag.setting` mechanism and are available as `yield* verboseFlag` / `yield* debugFlag` anywhere in the fiber — as proven by `readGlobalFlagProperties` in `telemetry.ts` which reads both in the same scope as error handling.

## Goals / Non-Goals

**Goals:**

- Single resolution path for verbose/debug — both CLIs resolve the same way via `CliFlags`
- Eliminate options-bag threading of verbosity through error handling functions
- Remove duplicate types, duplicate resolution, and dead code (`classifyError`)
- Spike CLI gets working verbose/debug with zero code changes

**Non-Goals:**

- Changing what `--verbose` or `--debug` display (rendering logic stays the same)
- Making `renderAppError` effectful (it stays pure, callers pass options)
- Adding new verbosity levels beyond verbose/debug

## Decisions

### 1. Add `verbose`/`debug` to `CliFlagsService`, resolve in `makeCliFlagsLayer`

`CliFlagsService` gains `verbose: boolean` and `debug: boolean`. Resolution in `makeCliFlagsLayer` combines the Effect CLI global flag setting (`yield* verboseFlag`, `yield* debugFlag`) with env var overrides passed via options:

```typescript
const debug = yield * debugFlag || (options?.envDebug ?? false);
const verbose = yield * verboseFlag || (options?.envVerbose ?? false) || debug;
```

**Why over alternatives:**

- Matches the existing pattern for `nonInteractive` (flag + env + fallback)
- `CliFlags` is already provided at the runtime boundary and consumed by handlers, workspace, and prompts — adding two fields is minimal
- Env var options (`envVerbose`, `envDebug`) let the main CLI pass `AXM_VERBOSE`/`AXM_DEBUG` without core knowing about cli-specific env var names

### 2. Error rendering reads `verboseFlag`/`debugFlag` directly from global flag settings

`writeExpectedCliError` in `runtime-envelope.ts` reads `yield* verboseFlag` and `yield* debugFlag` directly, rather than accepting `appErrorRenderOptions` in its options. These settings are always available in the fiber context when running inside an Effect CLI command (proven by `readGlobalFlagProperties` in the same module).

**Why not read from `CliFlags` service:** The error handling code runs before/outside the scope where `CliFlags` is provided (it wraps the provided program). Reading the raw flag settings avoids adding `CliFlags` to the requirements channel of `withCliErrorHandling`.

**Why not `Effect.serviceOption`:** Unnecessary complexity — the flag settings are always present in any Effect CLI dispatch context. No optionality needed.

`renderAppError` stays pure. Its second parameter becomes `{ verbose: boolean; debug: boolean }` (inline, no named type). Callers in effectful context read flags and pass them.

### 3. `displayPlan` reads from `CliFlags` service

`displayPlan` runs inside a workspace context where `CliFlags` is always provided. It reads `flags.verbose` / `flags.debug` from the service instead of calling `resolveDiagnosticVerbosity()`. This eliminates the duplicate resolution.

### 4. Debug logger layer reads from `CliFlags`

The main CLI's `makeDebugLoggerLayer` currently accepts a `DiagnosticVerbosity` parameter. After this change, the debug logger is constructed after `CliFlags` is resolved, reading `flags.debug` to decide whether to enable `Logger.consolePretty()`.

### 5. Delete `classifyError`

`classifyError` in `runtime/error-handling.ts` is only called from `runtime.test.ts`. Its logic (pattern match on `_tag`, render with verbosity, return exit code) is already handled by `withCliErrorHandling`. Delete both the function and its tests.

### 6. Delete `RenderAppErrorOptions` named type

Replace with an inline parameter type `{ readonly verbose: boolean; readonly debug: boolean }` on `renderAppError`. No need for a named export — the shape is trivial and only used at call sites.

## Risks / Trade-offs

**Env var resolution moves to `makeCliFlagsLayer` options** — The main CLI must pass `envVerbose`/`envDebug` when constructing the layer. This is a one-line change at the call site, but it does mean env var names are resolved in the CLI package, not in core. → This is intentional: core shouldn't know about `AXM_VERBOSE`; the CLI resolves it and passes a boolean.

**`writeExpectedCliError` reads flag settings directly** — This creates a dependency on Effect CLI's `GlobalFlag.setting` mechanism being available in the fiber context. If `withCliErrorHandling` were ever called outside an Effect CLI dispatch (e.g., from a test), the flag settings would use their defaults (`false`). → Acceptable: tests that need verbose error output can provide the flag settings explicitly, and this matches the existing pattern where `readGlobalFlagProperties` already reads these settings in the same scope.
