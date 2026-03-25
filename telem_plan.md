# Telemetry Enrichment Plan

Enrich CLI telemetry with full command inputs and outcome tracking.

## Current State

- `trackCliCommand` fires `command_invoked` at start with only the command name
- Errors reported separately via `reportCliError` / `reportCliDefect` to `POST /errors`
- No success event, no duration, no flags/args in event payload
- Per-command flags (`yes`, `force`, `preview`) available at `withRuntime` but not forwarded
- Global flags (`--non-interactive`, `--verbose`, `--debug`, `--output-format`) resolved by Effect CLI framework into services, never captured for telemetry
- Existing property naming is ad-hoc (camelCase in envelope, no convention for event properties)

## Goals

1. Capture all parsed per-command flags/arguments and their values in `command_invoked`
2. Capture global flags in `command_invoked`
3. Disambiguate flags vs arguments in event payloads
4. Emit `command_completed` with result status and duration
5. Automatic — no per-command serialization logic
6. Graceful degradation — telemetry works even if argv capture is missing
7. Adopt OpenTelemetry semantic conventions for property naming

## Conventions

### Property naming: OpenTelemetry semantic conventions

All event properties use **dot-separated snake_case namespaces**, following [OpenTelemetry semantic conventions](https://opentelemetry.io/docs/specs/semconv/):

- `namespace.attribute_name` — e.g. `cli.command`, `cli.flag.yes`, `cli.arg.source`
- Snake_case for multi-word attributes — e.g. `cli.duration_ms`, `cli.error_code`, `cli.output_format`
- Dot separators for namespace hierarchy — e.g. `cli.flag.*`, `cli.arg.*`, `cli.global.*`

This convention:

- Aligns with OTel, PostHog, Amplitude, Google Analytics, Datadog
- Is SQL-friendly (no quoting needed in warehouses)
- Provides a migration path to native OTel spans/exporters later
- Uses `cli.*` as the root namespace (OTel convention for CLI tooling)

**Namespace structure:**

| Prefix            | Source                  | Example                          |
| ----------------- | ----------------------- | -------------------------------- |
| `cli.command`     | Command name            | `"skills install"`               |
| `cli.arg.*`       | Positional arguments    | `cli.arg.source`                 |
| `cli.flag.*`      | Per-command flags       | `cli.flag.scope`, `cli.flag.yes` |
| `cli.global.*`    | Global flags            | `cli.global.non_interactive`     |
| `cli.result`      | Outcome status          | `"success"`, `"error"`           |
| `cli.duration_ms` | Execution time          | `"1234"`                         |
| `cli.error_code`  | Error code (on failure) | `"SOURCE_CLONE_FAILED"`          |

**Note:** The envelope fields (`distinctId`, `sentAt`, `context`) remain camelCase — that's the transport structure, not analytics data. Only the `properties` dict follows OTel conventions.

## Design

### How CLI parsing works (context for design decisions)

Effect CLI v4 parses in two phases:

1. **Global flags extracted first** — `consumeKnownFlags` strips `--non-interactive`, `--verbose`, `--debug`, `--output-format` from the token stream. These are provided as Effect services via `GlobalFlag.setting()` and `Effect.provideService`. They never appear in `ParsedTokens`.

2. **Per-command parsing** — remaining tokens are parsed against the command's config (`Argument` and `Flag` definitions). The handler receives a flat resolved object (e.g. `{ source: "owner/repo", scope: "project", yes: true }`). Each `Param` in the config definition has a `kind` field (`"argument"` or `"flag"`), but this metadata is not passed to the handler — only the resolved values are.

This means:

- **Per-command inputs**: must be captured via `Command.provideSync` at the command boundary
- **Global flags**: must be read from their Effect services inside `withCliErrorHandling`
- **Flag vs argument disambiguation**: requires passing the config definition alongside the resolved values

### Approach: `Command.provideSync` + config introspection + global flag reading

```
Command.make("install", installConfig, handler)
  │
  ├─ withArgvTracking(installConfig)
  │     ↓ Command.provideSync — sets CommandArgv service with:
  │       - resolved values (the parsed input object)
  │       - paramKinds map extracted from config ({ source: "argument", scope: "flag", ... })
  │
  ├─ handler({ source, scope, skill, ... })
  │     ↓ calls withRuntime(...)
  │
  └─ withCliErrorHandling()
        ├─ reads CommandArgv via Effect.serviceOption (optional, won't fail)
        ├─ reads global flags from their Effect services (nonInteractiveFlag, verboseFlag, etc.)
        ├─ serializes all into OTel-namespaced properties (cli.arg.*, cli.flag.*, cli.global.*)
        ├─ trackCliCommand({ command, properties: { ...allProperties } })
        ├─ [program runs, timed]
        ├─ on success:    trackCliCommandCompleted({ command, result: "success", duration_ms })
        ├─ on cancelled:  trackCliCommandCompleted({ command, result: "cancelled", duration_ms })
        ├─ on AppError:   reportCliError() + trackCliCommandCompleted({ result: "error", error_code, duration_ms })
        └─ on defect:     reportCliDefect() + trackCliCommandCompleted({ result: "defect", duration_ms })
```

### Event Shapes

**`command_invoked`** (existing, enriched):

```json
{
  "event": "command_invoked",
  "properties": {
    "cli.command": "skills install",
    "cli.arg.source": "owner/repo",
    "cli.flag.scope": "project",
    "cli.flag.skill": "foo,bar",
    "cli.flag.all": "false",
    "cli.flag.yes": "true",
    "cli.flag.force": "false",
    "cli.flag.preview": "false",
    "cli.global.non_interactive": "false",
    "cli.global.verbose": "false",
    "cli.global.debug": "false",
    "cli.global.output_format": "none"
  }
}
```

**`command_completed`** (new):

```json
{
  "event": "command_completed",
  "properties": {
    "cli.command": "skills install",
    "cli.result": "success",
    "cli.duration_ms": "1234"
  }
}
```

On error:

```json
{
  "event": "command_completed",
  "properties": {
    "cli.command": "skills install",
    "cli.result": "error",
    "cli.duration_ms": "567",
    "cli.error_code": "SOURCE_CLONE_FAILED"
  }
}
```

### Delivery semantics

- `command_invoked`: fire-and-forget (`forkDetach` + swallow) — same as today. Losing it is fine.
- `command_completed`: awaited with swallowed errors (`swallowFailure`) — not fire-and-forget. It fires at end of execution; if detached the process may exit before the request completes. Small latency cost is acceptable since the command is already done.
- `reportCliError` / `reportCliDefect`: unchanged (already awaited with `swallowFailure`).

### Telemetry mode interaction

- `"on"`: both events sent
- `"errors"`: `command_invoked` skipped (existing behavior via `trackEvent` no-op), `command_completed` also skipped (it's a usage event, not an error). Error reports still sent via `/errors`.
- `"off"`: nothing sent

## Implementation

### Task 1: `CommandArgv` service + `withArgvTracking` helper

**File: `packages/core/src/unstable/cli-runtime/command-argv.ts`** (new)

Define `CommandArgv` service:

```typescript
interface CommandArgvService {
  readonly value: Record<string, unknown>;
  readonly paramKinds: Record<string, "argument" | "flag">;
}

class CommandArgv extends ServiceMap.Service<CommandArgv, CommandArgvService>()(
  "@axm.sh/core/CommandArgv",
) {}
```

Export `withArgvTracking` — accepts the command's config definition to extract param kinds:

```typescript
import { Command, Param } from "effect/unstable/cli";

const extractParamKinds = (config: Command.Config): Record<string, "argument" | "flag"> => {
  const result: Record<string, "argument" | "flag"> = {};
  for (const [key, value] of Object.entries(config)) {
    if (Param.isParam(value)) {
      result[key] = value.kind;
    }
    // Nested configs and arrays are not tracked (not used in current commands)
  }
  return result;
};

export const withArgvTracking = (config: Command.Config) =>
  Command.provideSync(CommandArgv, (input: Record<string, unknown>) => ({
    value: input,
    paramKinds: extractParamKinds(config),
  }));
```

Export `serializeArgv` — produces OTel-namespaced properties:

```typescript
export const serializeArgv = (
  argv: Record<string, unknown>,
  paramKinds: Record<string, "argument" | "flag">,
): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(argv)) {
    if (value == null) continue;
    const prefix = paramKinds[key] === "argument" ? "cli.arg" : "cli.flag";
    if (Array.isArray(value)) {
      result[`${prefix}.${key}`] = value.join(",");
    } else {
      result[`${prefix}.${key}`] = String(value);
    }
  }
  return result;
};
```

Re-export from `packages/core/src/unstable/cli-runtime/index.ts`.

Per-command usage — config must be a named const (minor refactor for commands that inline it):

```typescript
const installConfig = {
  source: Argument.string("source").pipe(...),
  scope: scopeFlag,
  skill: Flag.string("skill").pipe(...),
  all: Flag.boolean("all").pipe(...),
  yes: yesFlag,
  force: forceFlag,
  preview: previewFlag,
} as const;

export const installCommand = Command.make("install", installConfig, handler).pipe(
  withArgvTracking(installConfig),
  Command.withDescription(...),
);
```

### Task 2: Global flag capture

**File: `packages/core/src/unstable/cli-runtime/telemetry.ts`**

Add a helper that reads the four global flag services and serializes them:

```typescript
import { nonInteractiveFlag, outputFormatFlag } from "../cli-flags/index.js";

// verboseFlag and debugFlag are defined in packages/cli/src/runtime.ts,
// so either move them to core or pass them via options. See design note below.

export const readGlobalFlagProperties = Effect.gen(function* () {
  const nonInteractive = yield* nonInteractiveFlag;
  const outputFormat = yield* outputFormatFlag;
  // verbose + debug — see Task 2 design note
  return {
    "cli.global.non_interactive": String(Option.getOrElse(nonInteractive, () => false)),
    "cli.global.output_format": Option.getOrElse(outputFormat, () => "none"),
  };
});
```

**Design note on `verbose` / `debug`:** These global flags are defined in `packages/cli/src/runtime.ts` (not in core). Two options:

- **(a)** Move `verboseFlag` and `debugFlag` definitions to `packages/core/src/unstable/cli-flags/` so telemetry in core can read them directly.
- **(b)** Accept an optional `globalFlagProperties` record in `withCliErrorHandling` options, letting the CLI package pass them in.

Recommendation: **(a)** — they're generic CLI flags, not CLI-specific business logic. Moving them to core is cleaner and keeps telemetry self-contained.

### Task 3: `trackCliCommandCompleted` function

**File: `packages/core/src/unstable/cli-runtime/telemetry.ts`**

```typescript
export interface CliCommandCompletedOptions {
  readonly command: string;
  readonly result: "success" | "error" | "cancelled" | "defect";
  readonly durationMs: number;
  readonly errorCode?: string;
}

export const trackCliCommandCompleted = (options: CliCommandCompletedOptions) =>
  Effect.gen(function* () {
    const telemetry = yield* TelemetryClient;
    yield* telemetry.trackEvent("command_completed", {
      "cli.command": options.command,
      "cli.result": options.result,
      "cli.duration_ms": String(options.durationMs),
      ...(options.errorCode && { "cli.error_code": options.errorCode }),
    });
  });
```

Export from index.

### Task 4: Update `trackCliCommand` property keys

**File: `packages/core/src/unstable/cli-runtime/telemetry.ts`**

Update the existing `trackCliCommand` to use OTel naming:

```typescript
export const trackCliCommand = ({
  command,
  event = "command_invoked",
  properties,
}: CliCommandTelemetryOptions): Effect.Effect<void, never, TelemetryClient> =>
  Effect.gen(function* () {
    const telemetry = yield* TelemetryClient;
    yield* telemetry.trackEvent(event, { "cli.command": command, ...(properties ?? {}) });
  });
```

This is a breaking change for existing event consumers — the `command` property key becomes `cli.command`. Coordinate with any dashboards or queries that filter on `command`.

### Task 5: Wire into `withCliErrorHandling`

**File: `packages/core/src/unstable/cli-runtime/runtime-envelope.ts`**

Changes to `withCliErrorHandling`:

1. Read `CommandArgv` via `Effect.serviceOption` (optional — `None` if not provided)
2. Serialize per-command argv with OTel namespace prefixes using `serializeArgv`
3. Read global flags via `readGlobalFlagProperties`
4. Merge all properties into `trackCliCommand` call (command key becomes `cli.command`)
5. Capture start time (`Date.now()`) before program execution
6. Emit `trackCliCommandCompleted` in each exit path:
   - After successful program completion (`Effect.tap`)
   - In the `Effect.catch` branch for `AppError` / `PromptCancelled`
   - In the `Effect.catchCause` branch for defects
7. Use `swallowFailure` (not `fireAndForget`) for the completion event

The `CommandArgv` dependency must be excluded from the function's `R` type since it's optional. `Effect.serviceOption` handles this — it returns `Option<CommandArgv>` without requiring the service in `R`.

### Task 6: Apply `withArgvTracking` to all leaf commands

**Files: ~26 command files in `packages/cli/src/commands/`**

Two changes per file:

1. Extract inline config to a named const (if not already)
2. Add `withArgvTracking(config)` to the `.pipe()` chain

```typescript
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";

const installConfig = { ... } as const;

export const installCommand = Command.make("install", installConfig, handler).pipe(
  withArgvTracking(installConfig),
  Command.withDescription(...),
  ...
);
```

Leaf commands to update:

- `commands/init/command.ts`
- `commands/auth/login.ts`
- `commands/auth/logout.ts`
- `commands/auth/whoami.ts`
- `commands/auth/token.ts`
- `commands/skills/install.ts`
- `commands/skills/uninstall.ts`
- `commands/skills/list.ts`
- `commands/skills/enable.ts`
- `commands/skills/disable.ts`
- `commands/skills/update.ts`
- `commands/skills/rename.ts`
- `commands/skills/new.ts`
- `commands/skills/fork.ts`
- `commands/skills/publish.ts`
- `commands/packs/install.ts`
- `commands/packs/uninstall.ts`
- `commands/packs/add.ts`
- `commands/packs/remove.ts`
- `commands/packs/new.ts`
- `commands/packs/publish.ts`
- `commands/packs/unpack.ts`
- `commands/commands/install.ts`
- `commands/commands/uninstall.ts`
- `commands/mcp-servers/install.ts`
- `commands/mcp-servers/uninstall.ts`

Group commands (`skills/command.ts`, `packs/command.ts`, etc.) are skipped — they just show help.

### Task 7: Move `verboseFlag` and `debugFlag` to core

**From:** `packages/cli/src/runtime.ts`
**To:** `packages/core/src/unstable/cli-flags/index.ts`

These are generic CLI flags with no CLI-package-specific dependencies. Moving them to core allows the telemetry code in core to read them directly without cross-package plumbing.

Update imports in `packages/cli/src/runtime.ts` to re-export from core.

### Task 8: Tests

**File: `packages/core/src/unstable/cli-runtime/telemetry.test.ts`**

- Test `trackCliCommandCompleted` emits correct event shape
- Test that `command_invoked` includes serialized argv when `CommandArgv` is provided
- Test that `command_invoked` works without `CommandArgv` (graceful degradation)
- Test that global flag properties appear in `command_invoked`
- Test OTel namespace prefixes: `cli.arg.*` for arguments, `cli.flag.*` for flags, `cli.global.*` for global flags

**File: `packages/core/src/unstable/cli-runtime/command-argv.test.ts`** (new)

- Test `serializeArgv` handles all value types (string, boolean, number, array, null/undefined)
- Test `extractParamKinds` correctly identifies arguments vs flags from a config object
- Test `serializeArgv` produces correct `cli.arg.*` / `cli.flag.*` prefixes

Consider updating existing runtime-envelope tests if they assert on telemetry event shapes.

## Non-goals

- Redacting or filtering specific arg values (source URLs, names, etc.) — all values are sent as-is. These are CLI inputs the user typed, not secrets.
- Changing the `/events` or `/errors` API contract on the server — new properties are additive.
- Tracking nested config structures — no current commands use nested configs, so `extractParamKinds` only handles flat `Param` entries.
