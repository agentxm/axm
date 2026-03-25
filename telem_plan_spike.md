# Telemetry Enrichment Plan — cli-spike

Bring cli-spike to parity with the main CLI's telemetry enrichment.

## Current State

- cli-spike's `withRuntime` calls `withCliErrorHandling` without `globalProperties`
- No `withArgvTracking` on any command — `CommandArgv` is never set
- Only 2 global flags registered (`nonInteractive`, `outputFormat`) — missing `verbose` and `debug`
- `command_invoked` fires with only `cli.command`, no argv or global flag properties
- No `command_completed` event (already wired in core's `withCliErrorHandling`, but no global properties flow through)

## What's Already Done (from core changes)

The core infrastructure is complete — cli-spike gets `command_completed` events for free since `withCliErrorHandling` already emits them. What's missing:

1. **Argv tracking** — per-command flags/arguments not captured in `command_invoked`
2. **Global flag properties** — `cli.global.*` properties not passed to `withCliErrorHandling`

## Design Consideration: Global Flag Registration

`readGlobalFlagProperties` reads all 4 global flags (`nonInteractive`, `outputFormat`, `verbose`, `debug`). cli-spike only registers 2 (`nonInteractive`, `outputFormat`). If cli-spike calls `readGlobalFlagProperties`, the Effect CLI framework won't have `verbose`/`debug` in context, causing a type error and runtime failure.

**Options:**

a) **Register verbose/debug as global flags in cli-spike** — They appear in `--help` but do nothing. Adds UI noise to a reference implementation.
b) **Write a spike-specific global flag reader** — Reads only the 2 flags cli-spike has. Duplicates logic.
c) **Pass hardcoded global properties from cli-spike's withRuntime** — Read `nonInteractive` and `outputFormat` inline, skip verbose/debug. Pragmatic, no new API.
d) **Register verbose/debug in cli-spike and wire them** — Full parity including diagnostic verbosity. Makes cli-spike a better reference implementation.

**Recommendation:** (d) — cli-spike is a reference implementation. Having full parity with the main CLI makes it a better proving ground. verbose/debug flags are generic CLI infrastructure that belongs in any CLI using the core framework.

## Implementation

### Task 1: Register verbose/debug global flags in cli-spike

**File: `packages/cli-spike/src/app.ts`**

Add `verboseFlag` and `debugFlag` to the global flags array:

```typescript
import {
  nonInteractiveFlag,
  outputFormatFlag,
  verboseFlag,
  debugFlag,
} from "@axm.sh/core/unstable/cli-flags";

const globalFlags = [nonInteractiveFlag, verboseFlag, debugFlag, outputFormatFlag] as const;
```

### Task 2: Pass global properties from cli-spike's `withRuntime`

**File: `packages/cli-spike/src/runtime.ts`**

Import `readGlobalFlagProperties` and pass the result to `withCliErrorHandling`:

```typescript
import {
  makeFoundationLayer,
  readGlobalFlagProperties,
  resolveCliFormat,
  withCliErrorHandling,
} from "@axm.sh/core/unstable/cli-runtime";

export const withRuntime = <A, R>(
  program: Effect.Effect<A, AppError | PromptCancelled, R>,
  options?: RuntimeOptions,
) =>
  Effect.gen(function* () {
    const format = yield* resolveCliFormat({ isLongRunning: options?.isLongRunning });
    const globalProperties = yield* readGlobalFlagProperties;
    const foundationLayer = makeFoundationLayer(format, {
      ci: spikeCliTelemetryConfig.ci,
    });
    const appLayer = Layer.provideMerge(FakeSkillsManagerLive, foundationLayer);
    const provided = program.pipe(Effect.provide(appLayer), Effect.scoped);

    return yield* withCliErrorHandling(provided, {
      command: options?.command,
      format,
      telemetryConfig: spikeCliTelemetryConfig,
      globalProperties,
    });
  });
```

### Task 3: Apply `withArgvTracking` to all leaf commands

**Files: 6 leaf commands**

Same pattern as the main CLI — extract inline config to a named const, add `withArgvTracking(config)` to `.pipe()` chain.

Leaf commands to update:

- `commands/skills/list.ts` — `listConfig` (scope, agent)
- `commands/skills/install.ts` — `installConfig` (source, scope, skill, all, yes)
- `commands/skills/new.ts` — `newConfig` (name, namespace, agent)
- `commands/skills/uninstall.ts` — `uninstallConfig` (skill, yes, force, preview)
- `commands/telemetry/handled.ts` — `handledConfig` (empty `{}`)
- `commands/telemetry/defect.ts` — `defectConfig` (empty `{}`)

Group commands (`skills/command.ts`, `telemetry/command.ts`) are skipped.

### Task 4: Update tests

**File: `packages/cli-spike/src/main.test.ts`**

Existing tests validate telemetry error reporting via a capture server. They should continue to pass since the error reporting path is unchanged. Verify:

- `telemetry handled` still sends correct `/errors` payload
- `telemetry defect` still sends correct `/errors` payload
- Build cli-spike before running E2E tests (new exports from core)

No new spike-specific tests needed — the core tests already cover `serializeArgv`, `extractParamKinds`, and `trackCliCommandCompleted`.

## Non-goals

- Adding diagnostic verbosity / debug logger layer to cli-spike (the flags are registered for telemetry capture only)
- Adding workspace support to cli-spike
- Adding per-command `flags` option to cli-spike's `RuntimeOptions` (can be added later if needed)
