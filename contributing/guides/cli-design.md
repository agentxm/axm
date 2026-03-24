---
status: active
description: CLI command design conventions — Effect CLI architecture, structured output contracts, programmatic interaction, prompts, flags, errors, desktop app integration
depends-on:
  - ../../CLAUDE.md
---

# CLI Design Guide

Conventions for designing CLI commands as both a human interface and a
programmatic backbone for desktop apps. Covers Effect CLI + Effect architecture,
structured output contracts, NDJSON streaming, process lifecycle, error handling,
interactive prompts, and configuration. The CLI is the source of truth — GUIs
are thin clients.

> [Handlers](../../CLAUDE.md#handlers) — critical guidance

## Key Resources

- [Effect CLI API docs](https://effect-ts.github.io/effect/effect/unstable/cli/) — Command, flag, and help APIs
- [Command Line Interface Guidelines (clig.dev)](https://clig.dev/) — CLI design
  philosophy
- [Clack Documentation](https://bomb.sh/docs/clack/) — Interactive prompts and
  output components

## Skills

| Skill                                                            | Command | Description                                              |
| ---------------------------------------------------------------- | ------- | -------------------------------------------------------- |
| [cli-conventions](../../.claude/skills/cli-conventions/SKILL.md) | —       | Effect CLI + Effect patterns, command structure, testing |

---

## Effect CLI + Effect Architecture

> **Reference implementation:** `packages/cli-spike` — a self-documented
> working spike proving out idiomatic `effect/unstable/cli` patterns.
> Explanatory code comments throughout cover architecture, design decisions,
> and patterns. Start with `src/main.ts` for the entry point overview.

`effect/unstable/cli` handles command parsing; Effect handlers own business
logic. The root command tree lives in `main.ts`. Each leaf command is a
single-file module that defines its arguments, flags, and handler via
`Command.make()`. Global flags are defined once and registered on the root
command with `Command.withGlobalFlags()` — they're available to every
subcommand handler by yielding the flag effect.

For the complete architecture pattern with code examples, see the
`/cli-conventions` skill.

### Effect CLI Quick Reference

| Concept                            | Note                                          |
| ---------------------------------- | --------------------------------------------- |
| **Argument.string()**              | Required positional argument                  |
| **Argument.optional**              | Optional positional argument                  |
| **Argument.atLeast()**             | Variadic positional input                     |
| **Flag.boolean() / Flag.string()** | Boolean and text flags                        |
| **Flag.choice()**                  | Enum flag with constrained values             |
| **Flag.optional**                  | Makes a flag optional (returns `Option`)      |
| **Flag.withDefault()**             | Provides a default value for a flag           |
| **Flag.withAlias()**               | Short alias (e.g., `-y` for `--yes`)          |
| **Flag.atLeast()**                 | Repeatable flag (e.g., `--skill a --skill b`) |
| **Command.make()**                 | Define command with args, flags, and handler  |
| **Command.withSubcommands()**      | Parent/group command composition              |
| **Command.withGlobalFlags()**      | Register global flags on the root command     |
| **Command.withAlias()**            | Command alias (e.g., `ls` for `list`)         |
| **Command.withExamples()**         | Usage examples shown in `--help`              |
| **Command.runWith()**              | Run with built-in `--help` and `--version`    |
| **GlobalFlag.setting()**           | Root-scoped flags shared across subcommands   |

### Architecture Checklist

- [ ] **Bun runtime** — Uses Bun for fast startup and built-in TypeScript
- [ ] **Effect CLI for parsing** — Type-safe argument parsing via `effect/unstable/cli`
- [ ] **Effect for logic** — Command handlers are Effect programs
- [ ] **Single-file leaf commands** — Each command defines args, flags, and handler in one file
- [ ] **Global flags via `GlobalFlag.setting()`** — Defined once, yielded in any handler
- [ ] **`Command.runWith()` for entry** — Provides `--help` and `--version` automatically
- [ ] **Explicit group behavior** — Missing group subcommands show help by design

---

## Command Structure and Naming

Flags are self-documenting while positionals rely on order — prefer flags when
multiple values are needed.

For code examples, see the `/cli-conventions` skill.

### Command Naming Checklist

- [ ] **Noun-verb structure** — Commands follow `<resource> <action>` pattern
- [ ] **2-3 levels max** — Command hierarchy limited to 2-3 levels deep
- [ ] **kebab-case** — Command names use kebab-case (`pg-backup`, not
      `pgBackup`)
- [ ] **Flags over positionals** — Positionals only for single obvious value
- [ ] **Consistent verbs** — Same verbs across resources (`create`, `list`,
      `delete`, `update`)

### Command File Organization

```
src/
├── main.ts                     # Root command, global flags, run()
└── commands/
    └── skills/
        ├── command.ts           # Parent command (axm skills) — composes subcommands
        ├── install.ts           # axm skills install
        ├── uninstall.ts         # axm skills uninstall
        ├── list.ts              # axm skills list
        ├── update.ts            # axm skills update
        ├── new.ts               # axm skills new
        ├── fork.ts              # axm skills fork
        └── ...                  # One file per leaf command
```

### File Organization Checklist

- [ ] **Parent `command.ts` alongside leaf files** — `command.ts` next to leaf command files
- [ ] **Tests colocated** — Test files alongside implementation
- [ ] **One export per leaf** — Each leaf file exports a single `Command`
- [ ] **Scoped utils** — Shared utilities in `utils.ts` within subcommand folder

---

## Parent Command Behavior

Parent commands should welcome users when invoked without arguments — help them
discover what's available rather than scold them for not knowing. As
[clig.dev](https://clig.dev/) puts it: "concise guidance at first invocation
helps users learn your program conversationally."

```bash
# Feels like an error (avoid)
$ mycli extensions
Error: Please specify a command
Run 'mycli extensions --help' for usage

# Feels like a menu (preferred)
$ mycli extensions
Manage extensions for AI coding agents.

Commands:
  mycli extensions add <source>   Add an extension
  mycli extensions list           List installed extensions

Run 'mycli extensions <command> --help' for detailed usage.
```

For implementation pattern, see the `/cli-conventions` skill.

### Parent Command Checklist

- [ ] **Welcome, don't scold** — No arguments shows help, exits 0
- [ ] **Shows subcommands** — Lists available actions
- [ ] **Includes examples** — 1-2 common usage patterns
- [ ] **Points to more help** — Tells user how to get detailed usage

---

## Standard Flags

Effect CLI provides `--help` and `--version` automatically through
`Command.runWith()`. See CLAUDE.md for detailed flag semantics (`--yes`,
`--non-interactive`, `--force`, `--preview`).

### Global Flags

Applied to every command via `Command.withGlobalFlags()`:

| Flag                | Short | Type    | Purpose                                    |
| ------------------- | ----- | ------- | ------------------------------------------ |
| `--non-interactive` |       | boolean | Disable all interactive prompts            |
| `--output-format`   |       | choice  | Output mode: `text`, `json`, `stream-json` |

### Per-Command Flags

Reusable `Flag` definitions in `cli-flags/service.ts`. Import and include in `Command.make()` for commands that need them:

| Flag        | Short | Type    | Purpose                              |
| ----------- | ----- | ------- | ------------------------------------ |
| `--yes`     | `-y`  | boolean | Auto-accept confirmation prompts     |
| `--force`   | `-f`  | boolean | Override constraints that would fail |
| `--preview` |       | boolean | Display plan without applying        |

```typescript
// Global flags — defined once, registered on root command
const nonInteractiveFlag = GlobalFlag.setting("axm-non-interactive")({
  flag: Flag.boolean("non-interactive").pipe(Flag.optional, Flag.withDescription("...")),
});
const globalFlags = [nonInteractiveFlag, outputFormatFlag] as const;
Command.withGlobalFlags(globalFlags);

// Per-command flags — reusable Flag definitions (not GlobalFlag)
import { yesFlag, forceFlag, previewFlag } from "../../cli-flags/index.js";

Command.make("install", {
  source: Argument.string("source").pipe(...),
  yes: yesFlag,
  force: forceFlag,
  preview: previewFlag,
}, ({ source, yes, force, preview }) =>
  withCommandRuntime(handleInstall({ source }), {
    command: "skills install",
    flags: { yes, force, preview },
  }),
);

// Handlers read from the CliFlags service (unchanged)
const flags = yield* CliFlags;
if (flags.yes) { /* ... */ }
```

### `--quiet` Behavior

| Suppressed by `--quiet`      | NOT suppressed            |
| ---------------------------- | ------------------------- |
| Progress spinners            | Final results/output      |
| Phase messages               | Errors and warnings       |
| Informational status updates | Content written to stdout |

### Standard Flags Checklist

- [ ] **Global flags via `GlobalFlag.setting()`** — Defined once, yielded in handlers
- [ ] **--yes/-y** — Skips confirmations for CI automation
- [ ] **--non-interactive** — Disables all prompts, errors if required input missing
- [ ] **--force/-f** — Overrides constraints, does not imply `--yes`
- [ ] **--preview** — Display-only; requires `--yes` to auto-apply
- [ ] **--output-format** — Explicit output mode; overrides TTY auto-detection
- [ ] **Reserved letters honored** — No conflicts with `-h`, `-v`, `-q`, `-y`, `-f`
- [ ] **--quiet suppression** — Suppresses spinners and status; preserves results, errors, and stdout

---

## Structured Output Contracts

The CLI is the programmatic backbone for desktop apps. Structured output is a
versioned contract — not a formatted view of human output. Design output for
machine consumption from day one.

### Output Format Modes

| Mode          | When                     | stdout                   | stderr      |
| ------------- | ------------------------ | ------------------------ | ----------- |
| `text`        | Interactive terminal     | Human-readable, colored  | Diagnostics |
| `json`        | Instant commands, piping | Single JSON object/array | Diagnostics |
| `stream-json` | Long-running operations  | NDJSON (one object/line) | Diagnostics |

**Auto-detection:** When `--output-format` is not specified, default based on
TTY. If stdout is a TTY → `text`. If stdout is a pipe → `json` for instant
commands, `stream-json` for long-running operations.

```typescript
// Resolve output format once in the CliFlags service
const resolveOutputFormat = (
  explicit: Option.Option<"text" | "json" | "stream-json">,
  isLongRunning: boolean,
): "text" | "json" | "stream-json" =>
  Option.getOrElse(explicit, () =>
    process.stdout.isTTY ? "text" : isLongRunning ? "stream-json" : "json",
  );
```

### JSON Output Shape

Return **bare objects** for single-resource commands and **bare arrays** for
list commands. Include `"_version": 1` in all JSON output to support schema
evolution.

```typescript
// Single resource — bare object
// axm skills info owner/repo --output-format json
{"_version": 1, "name": "my-skill", "source": "owner/repo", "version": "1.2.0"}

// List — bare array
// axm skills list --output-format json
[
  {"_version": 1, "name": "my-skill", "source": "owner/repo", "version": "1.2.0"},
  {"_version": 1, "name": "other-skill", "source": "local", "version": "0.1.0"}
]
```

**Schema contract:** Publish TypeScript types from `packages/cli` that define
every command's output shape. Bump `_version` on breaking changes.

### JSON Output Rules

| Rule                        | Rationale                                                 |
| --------------------------- | --------------------------------------------------------- |
| Always include all keys     | Use `null` instead of omitting — stable shape             |
| Consistent types per field  | Never string `"3"` in one context, integer `3` in another |
| ISO 8601 timestamps in JSON | Human-friendly "10 days ago" only in `text` mode          |
| No mixing text into JSON    | stdout is 100% valid JSON when format is `json`           |
| Additive-only changes       | New fields OK; removing/renaming fields bumps `_version`  |

### NDJSON Streaming

For long-running operations (publish, install, sync), use NDJSON on stdout with
typed event objects. Each line is a complete, independently parseable JSON
object.

```typescript
// stream-json mode — one JSON object per line
{"type": "progress", "phase": "download", "percent": 25, "message": "Downloading owner/repo"}
{"type": "progress", "phase": "download", "percent": 100, "message": "Download complete"}
{"type": "progress", "phase": "install", "percent": 50, "message": "Installing skills"}
{"type": "log", "level": "info", "message": "Resolved 3 skills from manifest"}
{"type": "result", "_version": 1, "installed": ["skill-a", "skill-b", "skill-c"]}
```

**Event types:**

| Type       | Purpose                                 | Required fields               |
| ---------- | --------------------------------------- | ----------------------------- |
| `progress` | Incremental status for progress bars    | `phase`, `percent`, `message` |
| `log`      | Informational messages                  | `level`, `message`            |
| `result`   | Final output (last event)               | `_version` + command-specific |
| `error`    | Typed error (replaces stderr in stream) | `code`, `message`             |

**Critical rule:** Never write non-JSON text to stdout in `json` or
`stream-json` mode. All human-readable messages go to stderr. This is the
single most common mistake production CLIs make.

### Effect Integration for Output Formatting

Thread the resolved output format through handlers via the `CliFlags` service.
Use a write helper that routes output to the correct channel, encoding through
Effect Schema to enforce the published contract:

```typescript
// Output helper — routes based on format, validates through Schema
// See packages/cli-spike/src/output.ts for the full implementation
const writeOutput = <S extends Schema.Encoder<unknown>>(
  format: OutputFormat,
  schema: S,
  data: S["Type"],
  textRenderer: (data: S["Type"]) => string,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    switch (format) {
      case "text":
        yield* Console.log(textRenderer(data));
        break;
      case "json": {
        const encoded = Schema.encodeSync(schema)(data);
        yield* Console.log(JSON.stringify(encoded));
        break;
      }
      case "stream-json": {
        // Wrapped with { type: "result" } to distinguish from progress events
        const encoded = Schema.encodeSync(schema)(data);
        yield* Console.log(JSON.stringify({ type: "result", data: encoded }));
        break;
      }
    }
  });

// NDJSON event emitter for streaming operations
const emitEvent = (event: StreamEvent): Effect.Effect<void> => Console.log(JSON.stringify(event));
```

**Handler pattern** (same 3 steps for every command):

```typescript
(config) =>
  Effect.gen(function* () {
    const format = resolveOutputFormat(yield* outputFormatFlag, isLongRunning);
    const data = yield* doWork(config);
    yield* writeOutput(format, OutputSchema, data, renderText);
  });
```

### Structured Output Checklist

- [ ] **`--output-format` global flag** — `text`, `json`, `stream-json`
- [ ] **TTY auto-detection** — Defaults to `text` in TTY, `json`/`stream-json` in pipe
- [ ] **`_version` in JSON** — All JSON output includes `"_version": 1`
- [ ] **Bare objects/arrays** — No envelope wrapper for `json` mode
- [ ] **NDJSON for streaming** — Typed events for long-running operations
- [ ] **stdout is pure data** — No human text on stdout in `json`/`stream-json` mode
- [ ] **stderr for diagnostics** — Progress, spinners, warnings always to stderr
- [ ] **TypeScript output types** — Published output shapes as the schema contract
- [ ] **Consistent types** — Same field always has same type across commands
- [ ] **ISO 8601 dates** — Timestamps in JSON, human-friendly in text only

---

## Three-Channel Error Pattern

Errors are routed through three channels to serve both human and programmatic
consumers simultaneously.

| Channel       | Content                                 | Consumer           |
| ------------- | --------------------------------------- | ------------------ |
| **stdout**    | Typed error JSON (in json/stream modes) | Programmatic       |
| **stderr**    | Human-readable error + diagnostics      | Humans, pipe debug |
| **Exit code** | Machine-readable status                 | Scripts, CI        |

### Exit Codes

| Code | Meaning                                   |
| ---- | ----------------------------------------- |
| 0    | Success (including `--help`, `--version`) |
| 1    | Runtime error                             |
| 2    | Usage/validation error                    |
| 4    | Canceled (user or prompt cancellation)    |
| 130  | SIGINT (Ctrl+C)                           |

### Error Output by Format

```typescript
// text mode — human-readable to stderr, exit 1
// stderr:
// ✗ Extension not found
//   Searched: registry.axm.sh, local workspace
//   Run 'axm skills install owner/repo' to install it.

// json mode — typed error JSON to stdout + human message to stderr
// stdout:
{"type": "error", "code": "EXTENSION_NOT_FOUND", "message": "Extension not found", "details": ["Searched: registry.axm.sh, local workspace"], "howToFix": "Run 'axm skills install owner/repo' to install it."}
// stderr:
// ✗ Extension not found

// stream-json mode — error event in the NDJSON stream
// stdout:
{"type": "error", "code": "EXTENSION_NOT_FOUND", "message": "Extension not found", "details": ["Searched: registry.axm.sh, local workspace"]}
```

### Effect Error Mapping

Effect's typed error system (`_tag` discriminator) maps to structured error
output. Catch errors by tag and serialize to the appropriate channel:

```typescript
// Map AppError to structured output at the run() boundary
const handleError = (error: AppError | PromptCancelled, format: "text" | "json" | "stream-json") =>
  Effect.gen(function* () {
    switch (error._tag) {
      case "PromptCancelled":
        if (format !== "text") {
          yield* Console.log(
            JSON.stringify({ type: "error", code: "CANCELLED", message: error.message }),
          );
        }
        process.exit(4);
        break;
      case "AppError": {
        // Always write human-readable to stderr
        yield* Console.error(renderAppError(error));
        // Write structured error to stdout in json/stream-json modes
        if (format !== "text") {
          yield* Console.log(
            JSON.stringify({
              type: "error",
              code: error.code,
              message: error.what,
              details: error.details,
              howToFix: Option.getOrNull(error.howToFix),
            }),
          );
        }
        process.exit(error.code.startsWith("USAGE_") ? 2 : 1);
        break;
      }
    }
  });
```

`Command.runWith()` handles `--help` and `--version` output automatically.
Catch `AppError` at the top-level `run()` boundary using `AppError.isAppError()`
and route through the error handler.

For error message format examples, see the `/cli-conventions` skill.

### Error Handling Checklist

- [ ] **Exit 0/1/2/4** — Success=0, runtime=1, usage=2, canceled=4
- [ ] **What happened** — Error explains what went wrong
- [ ] **How to fix** — Error suggests resolution
- [ ] **Effect errors mapped** — Typed errors mapped to user-facing messages
- [ ] **JSON errors on stdout** — Typed error objects in json/stream-json modes
- [ ] **Human errors on stderr** — Always readable in stderr for pipe debugging
- [ ] **Error codes are stable** — `AREA_REASON` format, greppable, versioned

---

## Process Lifecycle and IPC

Desktop apps (Tauri, Electron) wrap the CLI as a subprocess. These conventions
ensure clean process management.

### The Subprocess Model

The CLI is spawned as a child process. Desktop apps communicate via
stdout/stdin, using NDJSON for structured data. This "git model" — where the CLI
is the source of truth and GUIs are thin clients — is more maintainable than
shared libraries and more portable than embedded runtimes.

```
┌─────────────┐    stdin (NDJSON)     ┌─────────┐
│  Desktop App │ ──────────────────▶ │   axm   │
│  (Tauri)     │ ◀────────────────── │   CLI   │
└─────────────┘    stdout (NDJSON)    └─────────┘
                   stderr (diagnostics)
```

### TTY Detection Drives Mode Switching

When spawned as a subprocess with pipes (default for `child_process.spawn`),
stdout is a pipe, not a TTY, so `isTTY` returns `false`. This auto-selects
structured output.

| Condition         | Output behavior                                       |
| ----------------- | ----------------------------------------------------- |
| TTY (interactive) | Colors, progress bars, spinners, prompts, pager       |
| Non-TTY (piped)   | No colors, no progress, no prompts, structured output |

`--output-format` overrides TTY detection — `--output-format json` forces
structured output in a terminal, `--output-format text` forces human output in a
pipe. Support `NO_COLOR` (cross-tool standard from no-color.org) and
`--non-interactive` to explicitly disable interactive prompts.

### Graceful Shutdown

The CLI must respond to shutdown signals for clean subprocess management:

1. On `SIGTERM` (Unix) or stdin close/EOF (cross-platform), finish the current
   operation within a timeout (5 seconds), then force-exit.
2. If the CLI detects its parent process has died (stdin closed unexpectedly),
   self-terminate — prevents orphan processes.

```typescript
// Graceful shutdown handler
// Uses forkChild (v4) so the fiber is supervised — auto-interrupted if parent exits.
// Exit code 130 is POSIX convention for signal termination (128 + SIGINT).
const withGracefulShutdown = <A, E, R>(program: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  Effect.gen(function* () {
    const fiber = yield* Effect.forkChild(program);

    const interruptAndExit = (exitCode: number) => {
      Effect.runFork(
        Fiber.interrupt(fiber).pipe(
          Effect.timeout("5 seconds"),
          Effect.ensuring(Effect.sync(() => process.exit(exitCode))),
        ),
      );
    };

    process.on("SIGTERM", () => interruptAndExit(130));
    process.on("SIGINT", () => interruptAndExit(130));

    // v4: Fiber.join required (Fiber is no longer an Effect subtype)
    return yield* Fiber.join(fiber);
  });
```

### Tauri Sidecar Integration

The CLI compiles to a Bun binary and bundles as a Tauri sidecar with
platform-specific naming (`axm-aarch64-apple-darwin`,
`axm-x86_64-pc-windows-msvc.exe`). Key considerations:

- **Tauri does not auto-kill sidecars** — implement cleanup in the `on_exit`
  hook and call `child.kill()` on all spawned sidecars
- **Windows process trees** — use `taskkill /F /T /PID` or `tree-kill` pattern;
  Windows doesn't propagate POSIX signals
- **Heartbeat** — if stdin closes unexpectedly, self-terminate to prevent orphans

### Bidirectional Communication (Future)

For commands that accept input during execution, add `--input-format stream-json`
to accept NDJSON on stdin. Each line is a command or response:

```json
{"type": "input", "field": "name", "value": "my-skill"}
{"type": "confirm", "accepted": true}
```

### Process Lifecycle Checklist

- [ ] **TTY auto-detection** — Structured output when not a TTY
- [ ] **SIGTERM/SIGINT handling** — Graceful shutdown with timeout
- [ ] **Stdin EOF detection** — Self-terminate when parent dies
- [ ] **No orphan processes** — Desktop app kills sidecars on exit
- [ ] **Cross-platform signals** — Handle Windows lack of POSIX signals
- [ ] **Bun-compiled binary** — Single executable for sidecar bundling

---

## Interactive Prompts and Output (clack-effect)

All Clack interactions are wrapped as Effect services in
`packages/cli/src/clack-effect/`. Never call `@clack/prompts` directly in
handlers — use the service layer for cancellation handling, non-interactive
guards, testability, and dependency injection.

### Service Overview

| Service         | Purpose                                                | Dependencies |
| --------------- | ------------------------------------------------------ | ------------ |
| `ClackPrompt`   | All interactive prompts (text, select, confirm, etc.)  | `CliFlags`   |
| `ClackLog`      | Structured messages (info, warn, error, success, etc.) | None         |
| `ClackSpinner`  | Spinner lifecycle with error/interrupt awareness       | None         |
| `ClackProgress` | Progress bars with advance handle                      | None         |
| `ClackStream`   | Stream-based log output                                | None         |
| `ClackTaskLog`  | Grouped task logs with sub-sections                    | None         |

All services are composed into a single `ClackLive` layer, provided at the
runtime boundary alongside `CliFlags`.

### Using Services in Handlers

```typescript
import { ClackLog, ClackPrompt, ClackSpinner } from "@/clack-effect";

const handleInstall = Effect.fn("Install.handle")(function* (args: InstallHandlerArgs) {
  const log = yield* ClackLog;
  const prompt = yield* ClackPrompt;
  const spinner = yield* ClackSpinner;

  // Logging — routes through ClackLog service
  yield* log.info("Resolving extension source...");

  // Prompts — cancellation and non-interactive handled automatically
  const scope = yield* prompt.select({
    message: "Where should this be installed?",
    options: [
      { value: "project" as const, label: "Project" },
      { value: "user" as const, label: "User" },
    ],
  });

  // Spinners — lifecycle managed, interrupt-aware cleanup
  const result = yield* spinner.withSpinner(
    "Installing skills...",
    (handle) =>
      Effect.gen(function* () {
        yield* handle.message("Downloading manifest");
        // ... business logic
        return installed;
      }),
    "Installation complete",
  );

  yield* log.success(`Installed ${result.length} skills`);
});
```

### ClackPrompt — Interactive Prompts

`ClackPrompt` wraps all `@clack/prompts` prompt types. Each method returns
`Effect<T, AppError | PromptCancelled>` — cancellation and non-interactive mode
are handled automatically by the service.

**Available prompt methods:**

| Method                            | Returns                    | Wraps                       |
| --------------------------------- | -------------------------- | --------------------------- |
| `text(config)`                    | `Effect<string>`           | `p.text`                    |
| `password(config)`                | `Effect<string>`           | `p.password`                |
| `confirm(config)`                 | `Effect<boolean>`          | `p.confirm`                 |
| `select(config)`                  | `Effect<V>`                | `p.select`                  |
| `multiselect(config)`             | `Effect<ReadonlyArray<V>>` | `p.multiselect`             |
| `groupMultiselect(config)`        | `Effect<ReadonlyArray<V>>` | `p.groupMultiselect`        |
| `selectKey(config)`               | `Effect<V>`                | `p.selectKey`               |
| `autocomplete(config)`            | `Effect<V>`                | `p.autocomplete`            |
| `autocompleteMultiselect(config)` | `Effect<ReadonlyArray<V>>` | `p.autocompleteMultiselect` |
| `path(config)`                    | `Effect<string>`           | `p.path`                    |

**Built-in guards:** When `CliFlags.nonInteractive` is true, prompts fail with
`AppError` code `PROMPT_IN_NON_INTERACTIVE` — the handler should bypass prompts
via the `promptOrFlag` pattern when non-interactive is set.

### ClackLog — Structured Messages

`ClackLog` wraps `@clack/prompts` log functions. All methods return
`Effect<void>`.

```typescript
const log = yield * ClackLog;
yield * log.intro("axm v1.0.0");
yield * log.info("Connected to registry");
yield * log.warn("Rate limit approaching");
yield * log.error("Connection failed");
yield * log.success("Migration complete");
yield * log.note("Details here", "Summary");
yield * log.box("Boxed content", "Title");
yield * log.outro("Done!");
```

### ClackSpinner — Spinner Lifecycle

`ClackSpinner` manages spinner lifecycle with interrupt-aware cleanup. The
`withSpinner` method wraps an effectful operation:

- **On success:** stops with success message
- **On error (non-interrupt):** stops with error indicator, propagates error
- **On interrupt:** cancels spinner, propagates interrupt

```typescript
const spinner = yield * ClackSpinner;
const result =
  yield *
  spinner.withSpinner(
    "Processing...",
    (handle) =>
      Effect.gen(function* () {
        yield* handle.message("Step 1 of 3");
        // ... work
        yield* handle.message("Step 2 of 3");
        // ... more work
        return finalResult;
      }),
    { successMessage: "Done!", failureMessage: "Processing failed" },
  );
```

### ClackProgress — Progress Bars

`ClackProgress` extends the spinner pattern with progress tracking:

```typescript
const progress = yield * ClackProgress;
yield *
  progress.withProgress(
    { max: items.length, style: "block" },
    "Installing skills...",
    (handle) =>
      Effect.forEach(items, (item) =>
        Effect.gen(function* () {
          yield* handle.advance(1, `Installing ${item.name}`);
          yield* installSkill(item);
        }),
      ),
    "All skills installed",
  );
```

### ClackTaskLog — Grouped Task Logs

`ClackTaskLog` provides structured task output with grouping:

```typescript
const taskLog = yield * ClackTaskLog;
const handle = yield * taskLog.start({ title: "Build Tasks", limit: 10 });
yield * handle.message("Starting build pipeline");

const frontend = yield * handle.group("Frontend");
yield * frontend.success("TypeScript compiled");
yield * frontend.success("Assets bundled");

const backend = yield * handle.group("Backend");
yield * backend.success("Services compiled");
```

### ClackStream — Stream-Based Output

`ClackStream` logs Effect `Stream<string>` values through Clack formatters:

```typescript
const stream = yield * ClackStream;
const lines$ = Stream.fromIterable(["line 1", "line 2", "line 3"]);
yield * stream.info(lines$);
```

### runTasks — Sequential Task Execution

The `runTasks` helper executes a sequence of named tasks with spinner feedback:

```typescript
import { runTasks } from "@/clack-effect";

yield *
  runTasks([
    {
      title: "Downloading manifest",
      task: (message) =>
        Effect.gen(function* () {
          yield* message("Fetching from registry...");
          yield* downloadManifest(source);
          return "Manifest downloaded";
        }),
    },
    {
      title: "Installing skills",
      task: (message) =>
        Effect.gen(function* () {
          yield* message("Resolving dependencies...");
          yield* installAll(manifest);
          return "3 skills installed";
        }),
    },
    {
      title: "Cleanup (skipped)",
      task: () => Effect.void,
      enabled: false, // filtered out
    },
  ]);
```

### Testing with clack-effect

Each service provides a test layer that records method calls for assertion:

```typescript
import { ClackPrompt, ClackSpinner } from "@/clack-effect";

// Prompt test layer — configure return values
const [promptLayer] = makeClackPromptTestLayer(
  { type: "return", value: "my-skill" }, // first prompt returns "my-skill"
  { type: "return", value: true }, // second prompt returns true
);

// Spinner test layer — records calls
it("shows spinner during install", async () => {
  const result = await Effect.gen(function* () {
    return yield* handleInstall(args);
  }).pipe(
    Effect.provide(Layer.mergeAll(promptLayer, ClackSpinnerLive, ClackLogLive)),
    Effect.runPromise,
  );

  const { calls } = yield * (yield * ClackSpinnerTest).get;
  expect(calls).toContainEqual({ method: "withSpinner.start", args: ["Installing..."] });
});
```

### Non-Interactive Mode

The `ClackPrompt` service reads `CliFlags.nonInteractive` from its layer
dependency. When non-interactive, all prompts fail immediately — handlers should
bypass prompts using the `promptOrFlag` pattern:

```typescript
// Flag value skips the prompt entirely; missing flag triggers interactive prompt
const scope =
  yield *
  promptOrFlag(
    Option.getOrUndefined(args.scope),
    prompt.select({
      message: "Configuration scope",
      options: [
        { value: "project" as const, label: "Project" },
        { value: "user" as const, label: "User" },
      ],
    }),
  );
```

### Interactive Prompts Checklist

- [ ] **Uses clack-effect services** — `ClackPrompt`, `ClackLog`, `ClackSpinner`, etc.
- [ ] **Never imports `@clack/prompts` directly** — Always go through the service layer
- [ ] **Cancel exits 4** — `PromptCancelled` handled at run boundary, exits cleanly
- [ ] **Non-interactive fallback** — Every prompt has an equivalent flag via `promptOrFlag`
- [ ] **Suppressed in json modes** — No interactive prompts in json/stream-json output
- [ ] **Test layers used** — Tests use `makeClackPromptTestLayer` and similar helpers
- [ ] **Typed errors** — `AppError | PromptCancelled` in the error channel

---

## Output Conventions

Stream separation enables scripting: data to stdout, diagnostics to stderr.
Use `ClackLog` for all human-facing output in `text` mode — `json` and
`stream-json` modes use structured output instead (see
[Structured Output Contracts](#structured-output-contracts)).

| Color  | Usage    | Color     | Usage                 |
| ------ | -------- | --------- | --------------------- |
| Red    | Errors   | Blue/Cyan | Information           |
| Yellow | Warnings | Gray/Dim  | Secondary information |
| Green  | Success  |           |                       |

Colors disabled when: `NO_COLOR` set, `TERM=dumb`, `--no-color`, or non-TTY.

### Output Checklist

- [ ] **ClackLog for human output** — Uses `ClackLog` service, not `console.log` or `p.log` directly
- [ ] **stdout for data** — Results written to stdout for piping
- [ ] **stderr for diagnostics** — Progress, spinners, errors to stderr
- [ ] **TTY adaptive** — Rich output in TTY, plain text when piped
- [ ] **NO_COLOR respected** — Colors disabled when `NO_COLOR` env var set
- [ ] **--output-format takes precedence** — Structured output regardless of TTY
- [ ] **ClackSpinner for async** — Long-running operations use `ClackSpinner.withSpinner`
- [ ] **Semantic log levels** — Uses `log.info/warn/error/success` appropriately

---

## Auth and Credential Sharing

Auth must work for both interactive CLI use and programmatic consumption by
desktop apps.

### Credential Storage

| Method              | Security                   | Use case                     |
| ------------------- | -------------------------- | ---------------------------- |
| OS keychain         | Encrypted at rest, ACL     | Default (recommended)        |
| `AXM_TOKEN` env var | Visible in proc environ    | Desktop app pass-through, CI |
| Config file         | Readable by user processes | Fallback only                |

Store credentials in the OS keychain by default. Support `AXM_TOKEN` environment
variable for desktop apps to pass tokens directly.

### Programmatic Auth State

```bash
# Structured auth status
axm auth status --output-format json
```

```json
{
  "_version": 1,
  "authenticated": true,
  "account": "user@example.com",
  "tokenSource": "keychain",
  "expiresAt": "2026-04-01T00:00:00Z"
}
```

```bash
# Raw token for piping
axm auth token
```

### Desktop App Auth Flow

Desktop app authenticates via **Authorization Code + PKCE** (it has a browser)
and passes the token to CLI via environment variable:

```
AXM_TOKEN=<token> axm publish --output-format json
```

This is the cleanest separation of concerns — the app owns auth lifecycle, the
CLI just uses the token.

### Auth Checklist

- [ ] **OS keychain default** — Credentials encrypted at rest
- [ ] **`AXM_TOKEN` env var** — Desktop app and CI token passing
- [ ] **`axm auth status --output-format json`** — Structured auth state
- [ ] **`axm auth token`** — Raw token output for piping
- [ ] **PKCE for desktop** — Desktop app authenticates via browser flow

---

## Configuration and State

### Programmatic Config Access

Expose all config through CLI commands — desktop apps should never parse config
files directly:

```bash
axm config get registry --output-format json
# {"_version": 1, "key": "registry", "value": "https://registry.axm.sh", "source": "user"}

axm config list --output-format json
# {"_version": 1, "settings": {"registry": "https://registry.axm.sh", "auth.method": "keychain"}}

axm config set registry https://custom.registry.example
```

### XDG Base Directories

Follow the XDG Base Directory Specification on all platforms:

| Purpose | Variable           | Default          | axm path                    |
| ------- | ------------------ | ---------------- | --------------------------- |
| Config  | `$XDG_CONFIG_HOME` | `~/.config`      | `~/.config/axm/config.toml` |
| Data    | `$XDG_DATA_HOME`   | `~/.local/share` | `~/.local/share/axm/`       |
| State   | `$XDG_STATE_HOME`  | `~/.local/state` | `~/.local/state/axm/logs/`  |
| Cache   | `$XDG_CACHE_HOME`  | `~/.cache`       | `~/.cache/axm/`             |

Support `AXM_CONFIG_DIR` override for testing and CI.

### Precedence

Highest to lowest: CLI flags → env vars → project config → user config →
defaults.

### Concurrent Access Safety

Use **atomic writes** (write to temp file, then `rename()`) for all
config/state modifications — atomic on POSIX, nearly atomic on Windows. Desktop
apps should serialize CLI invocations using a command queue with a reader/writer
lock (the GitHub Desktop pattern).

### Configuration Checklist

- [ ] **Flags highest priority** — CLI flags override all other config
- [ ] **Env vars prefixed** — Environment variables prefixed with `AXM_`
- [ ] **XDG compliant** — Uses XDG base directories
- [ ] **No secrets in flags** — Secrets via env vars or `--token-file`
- [ ] **`axm config` commands** — Programmatic config access for desktop apps
- [ ] **Atomic writes** — Config mutations use write-then-rename pattern
- [ ] **`AXM_CONFIG_DIR` override** — For testing and CI

---

## Capability Discovery

Version negotiation prevents silent failures when the desktop app and CLI
diverge.

### Version Command

```bash
axm version --output-format json
```

```json
{
  "_version": 1,
  "cli": "1.2.0",
  "api": "2026-03-01",
  "features": ["publish", "install", "sync", "extensions-v2"],
  "minDesktopVersion": "0.5.0"
}
```

This gives the desktop app everything it needs: CLI version for compatibility
checks, API version for server negotiation, feature list for graceful
degradation, and minimum desktop version for bidirectional compatibility.

### Desktop App Strategy

Bundle the `axm` binary as a Tauri sidecar to eliminate version skew. Still
check version on startup to handle cases where users also have `axm` installed
globally. If the bundled CLI is outdated relative to the API, show a
notification — don't silently fail.

### Capability Discovery Checklist

- [ ] **`axm version --output-format json`** — Structured version info
- [ ] **Feature list** — Enables graceful degradation in desktop app
- [ ] **`minDesktopVersion`** — Bidirectional compatibility checking
- [ ] **API version** — For server negotiation
- [ ] **Bundled binary** — Tauri sidecar eliminates version skew

---

## Workflow Automation Flags

Staged workflow pattern for commands that generate output to be persisted:

```bash
mycli generate report              # Preview only (default)
mycli generate report --apply      # Write to files
mycli generate report --apply --commit  # Write and git commit
```

Enforce flag dependencies in the handler logic — `--commit` requires `--apply`.
Distinguish from `--yes`: use `--apply` for "perform the write," `--yes` for
"skip confirmation."

### Workflow Automation Checklist

- [ ] **Preview default** — Without `--apply`, results displayed only
- [ ] **Commit requires apply** — `--commit` uses `implies: "apply"`
- [ ] **Idempotent apply** — Running `--apply` multiple times produces same
      result

---

## CI and Automation Mode

Detect CI via: `CI`, `GITHUB_ACTIONS`, `GITLAB_CI`, `CIRCLECI`, `JENKINS_URL`,
`TF_BUILD`, `BUILDKITE`.

### CI Checklist

- [ ] **CI detected** — Detects CI via standard env vars
- [ ] **No prompts in CI** — Prompts fail with error explaining required flags
- [ ] **Explicit flags required** — Destructive operations require `--yes` in CI
- [ ] **Idempotent** — Commands safe to run multiple times with same result
- [ ] **Structured output** — CI consumers use `--output-format json`

---

## Validation

Effect CLI validates argument/flag types at parse time. Use `Flag.choice()` for
enum flags with constrained values — pass `as const` for type inference. For
complex cross-flag validation (conflicts, dependencies), enforce in the handler
with typed errors.

```typescript
// Enum flag with type-safe constrained values
scope: Flag.choice("scope", ["project", "user"] as const).pipe(
  Flag.withDefault("project" as const),
),

// Repeatable flag (0 or more values)
skill: Flag.string("skill").pipe(Flag.atLeast(0)),

// Optional flag (returns Option)
namespace: Flag.string("namespace").pipe(Flag.optional),
```

### Validation Checklist

- [ ] **`Flag.choice()` for enums** — Constrained values with `as const`
- [ ] **`Flag.optional` for optional** — Returns `Option<T>` instead of failing
- [ ] **`Flag.withDefault()` for defaults** — Type-safe default values
- [ ] **Cross-flag validation in handler** — Conflicts and dependencies checked in Effect logic
- [ ] **`Argument.optional` for optional positionals** — Not every argument is required

---

## Anti-Patterns

Lessons from production failures across 12 CLIs and 8 desktop apps.

### Never Mix Streams

**The most common mistake.** Human text mixed into JSON stdout breaks every
programmatic consumer. Stripe CLI issue #1353, Fly, and pnpm all document this
problem.

```typescript
// BAD: warning pollutes JSON stdout
console.log("Warning: rate limit approaching"); // goes to stdout
console.log(JSON.stringify(result));

// GOOD: diagnostics to stderr, data to stdout
console.error("Warning: rate limit approaching"); // goes to stderr
console.log(JSON.stringify(result));
```

### Don't Rely on Text Parsing

Custom delimiter schemes, `ls` output, locale-dependent formatting — all break
on edge cases. Use `--output-format json` and typed JSON objects instead.

### Don't Retrofit JSON Later

CLIs that add `--json` as an afterthought (Wrangler, Vercel) end up with
inconsistent coverage. Design `--output-format` from day one and treat machine
output as a separate, stable API surface.

### Don't Omit Fields

```typescript
// BAD: different shapes depending on state
{"name": "skill-a"}                          // no version when unresolved
{"name": "skill-b", "version": "1.0.0"}     // version when resolved

// GOOD: consistent shape, null for absent values
{"name": "skill-a", "version": null}
{"name": "skill-b", "version": "1.0.0"}
```

### Don't Break Output Contracts

Docker 29.0 raised its minimum API version and broke Traefik overnight. GitHub
Desktop has experienced multiple parsing failures from unexpected output
formats. Include `_version` from day one and bump it on breaking changes.

### Anti-Patterns Checklist

- [ ] **No text in JSON stdout** — All diagnostics to stderr
- [ ] **No custom delimiter parsing** — Use typed JSON objects
- [ ] **`--output-format` from day one** — Not retrofitted later
- [ ] **All keys always present** — Use `null`, never omit
- [ ] **`_version` in output** — Schema versioning from the start
- [ ] **Additive-only changes** — Breaking changes bump `_version`
