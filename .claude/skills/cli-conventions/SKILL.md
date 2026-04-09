---
name: cli-conventions
description: Effect CLI + Effect architecture. Use when adding commands, defining flags, or wiring handlers. Covers file organization, argument/flag patterns, and testing.
user-invocable: false
---

# CLI Design Conventions

Apply these conventions when working on CLI commands.

> **Reference implementation:** `packages/cli-spike` — a self-documented
> working spike proving out idiomatic `effect/unstable/cli` patterns.
> Explanatory code comments cover architecture decisions, design rationale,
> and patterns. Start with `src/app.ts` for root composition and
> `src/runtime.ts` for runtime wiring. `src/main.ts` stays intentionally trivial.

---

## Effect CLI + Effect Architecture

`effect/unstable/cli` handles command parsing; Effect handlers own business
logic. Each leaf command is a single-file module that defines its arguments,
flags, and handler via `Command.make()`. For testability, extract the handler
into a separate function:

```typescript
import * as Effect from "effect/Effect";
import { Argument, Command, Flag } from "effect/unstable/cli";

// 1. Handler args interface (uses idiomatic Effect types)
interface InstallHandlerArgs {
  readonly source: string;
  readonly scope: "project" | "user";
  readonly skill: ReadonlyArray<string>;
  readonly all: boolean;
}

// 2. Pure Effect handler (testable without CLI parsing)
const handleInstall = (args: InstallHandlerArgs) =>
  Effect.gen(function* () {
    // Business logic here
  });

// 3. Command wires parsing to handler
export const installCommand = Command.make(
  "install",
  {
    source: Argument.string("source").pipe(
      Argument.withDescription("GitHub shorthand, local path, or URL"),
    ),
    scope: Flag.choice("scope", ["project", "user"] as const).pipe(
      Flag.withDescription("Configuration scope"),
      Flag.withDefault("project" as const),
    ),
    skill: Flag.string("skill").pipe(
      Flag.withDescription("Install only specified skill(s)"),
      Flag.atLeast(0),
    ),
    all: Flag.boolean("all").pipe(Flag.withDescription("Install all discovered skills")),
  },
  (config) => handleInstall(config),
).pipe(
  Command.withDescription("Install skills from GitHub or local path"),
  Command.withExamples([
    { command: "axm skills install owner/repo", description: "Install interactively" },
    {
      command: "axm skills install owner/repo --all --yes",
      description: "Install all, no prompts",
    },
  ]),
);
```

### Architecture Checklist

- [ ] **Bun runtime** — Uses Bun for fast startup and built-in TypeScript
- [ ] **Effect CLI for parsing** — Type-safe argument parsing via `effect/unstable/cli`
- [ ] **Effect for logic** — Command handlers are Effect programs
- [ ] **Handler separation** — Effect handlers separate from `Command.make()`
- [ ] **Single-file leaf commands** — Each command defines args, flags, and handler in one file
- [ ] **Global flags via `GlobalFlag.setting()`** — Defined once, yielded in any handler
- [ ] **`Command.runWith()` for entry** — Provides `--help` and `--version` automatically

---

## Argument and Flag Patterns

### Arguments (Positionals)

```typescript
import { Argument } from "effect/unstable/cli";

// Required string — config.source: string
source: Argument.string("source").pipe(
  Argument.withDescription("GitHub shorthand, local path, or URL"),
),

// Optional positional — config.source: Option<string>
source: Argument.string("source").pipe(
  Argument.withDescription("Filter to skills from a specific source"),
  Argument.optional,
),

// Variadic (1+ values) — config.extensions: ReadonlyArray<string>
extensions: Argument.string("extensions").pipe(
  Argument.withDescription("Extension names or glob patterns"),
  Argument.atLeast(1),
),

// Multiple required positionals — ordered, map to camelCase property names
oldName: Argument.string("old-name").pipe(
  Argument.withDescription("Current name of the skill"),
),
newName: Argument.string("new-name").pipe(
  Argument.withDescription("New name for the skill"),
),
```

### Flags

```typescript
import { Flag } from "effect/unstable/cli";

// Boolean flag — config.all: boolean
all: Flag.boolean("all").pipe(
  Flag.withDescription("Install all discovered skills"),
),

// Choice with default — config.scope: "project" | "user"
scope: Flag.choice("scope", ["project", "user"] as const).pipe(
  Flag.withDescription("Configuration scope"),
  Flag.withDefault("project" as const),
),

// Optional string flag — config.namespace: Option<string>
namespace: Flag.string("namespace").pipe(
  Flag.withDescription("Override the workspace namespace"),
  Flag.optional,
),

// Multi-value flag (repeatable, 0+) — config.skill: ReadonlyArray<string>
skill: Flag.string("skill").pipe(
  Flag.withDescription("Target skill(s) by name"),
  Flag.atLeast(0),
),

// Multi-value flag (optional, 1+ when present)
agent: Flag.string("agent").pipe(
  Flag.withDescription("Agent IDs to target"),
  Flag.atLeast(1),
  Flag.optional,
),

// Flag with alias — --yes or -y
Flag.boolean("yes").pipe(
  Flag.withAlias("y"),
  Flag.withDescription("Auto-accept confirmation prompts"),
),
```

### Argument/Flag Patterns Checklist

- [ ] **Required positional** — `Argument.string(name)` for mandatory single value
- [ ] **Optional positional** — `Argument.optional` returns `Option<T>`
- [ ] **Variadic positional** — `Argument.atLeast(n)` returns `ReadonlyArray<T>`
- [ ] **Choice flag** — `Flag.choice(name, [...] as const)` with `Flag.withDefault()`
- [ ] **Multi-value flag** — `Flag.atLeast(0)` for repeatable flags
- [ ] **Optional flag** — `Flag.optional` returns `Option<T>`
- [ ] **Flag alias** — `Flag.withAlias("y")` for short form
- [ ] **Descriptions on all** — Every argument and flag has `withDescription()`

---

## Command Structure

```bash
# Noun-verb structure with flags over positionals
mycli <resource> <action> [flags]
mycli skills install owner/repo --scope project
```

### File Organization

```
src/
├── main.ts                     # Entry point (shebang + delegates to app)
├── app.ts                      # Root command, global flags, run()
├── runtime.ts                  # withRuntime() + service provisioning
└── root/
    └── skills/
        ├── command.ts           # Parent command — composes subcommands
        ├── install.ts           # Required arg + choice flag + multi-value flag + boolean flag
        ├── uninstall.ts         # Required arg only
        ├── list.ts              # Flags only + Command.withAlias("ls")
        ├── update.ts            # Optional arg (Argument.optional) + multi-value flags
        ├── new.ts               # Required arg + Flag.optional + Flag.atLeast(1)
        ├── fork.ts              # Required arg + multi-value flag
        ├── rename.ts            # Two required positional args
        ├── publish.ts           # Variadic arg (Argument.atLeast(1)) + optional flag
        ├── enable.ts            # Required arg + choice flag
        └── disable.ts           # Required arg + choice flag
```

### Command Naming Checklist

- [ ] **Noun-verb structure** — Commands follow `<resource> <action>` pattern
- [ ] **2-3 levels max** — Command hierarchy limited to 2-3 levels
- [ ] **kebab-case** — Command names use kebab-case
- [ ] **Flags over positionals** — Positionals only for single obvious value
- [ ] **Consistent verbs** — Same verbs across resources (`create`, `list`, `delete`)

---

## Parent Command Behavior

Parent commands group subcommands — no handler, just `Command.withSubcommands()`.
When invoked without a subcommand, Effect CLI shows help and exits 0:

```typescript
import { Command } from "effect/unstable/cli";

export const skillsCommand = Command.make("skills").pipe(
  Command.withDescription("Install, update, and manage skills"),
  Command.withSubcommands([installCommand, uninstallCommand, listCommand]),
);
```

### Command Decorators

```typescript
// Alias — axm skills ls → axm skills list
Command.withAlias("ls"),

// Examples — shown in --help output
Command.withExamples([
  { command: "axm skills list", description: "List project skills" },
  { command: "axm skills list --scope user", description: "List user-level skills" },
]),
```

---

## Global and Per-Command Flags

Global flags (`--non-interactive`, `--json`/`-j`, `--verbose`/`-v`, `--debug`,
`--quiet`/`-q`) apply to every command. `--yes`, `--force`, `--preview` are
per-command flags — import and include in `Command.make()` only for commands
that need them.

```typescript
import { Command, Flag, GlobalFlag } from "effect/unstable/cli";
import { yesFlag, forceFlag, previewFlag } from "../../cli-flags/index.js";

// Global flags — defined once, registered on root command
const nonInteractiveFlag = GlobalFlag.setting("app-non-interactive")({
  flag: Flag.boolean("non-interactive").pipe(
    Flag.optional,
    Flag.withDescription("Disable all interactive prompts"),
  ),
});
const jsonFlag = GlobalFlag.setting("axm-json")({
  flag: Flag.boolean("json").pipe(
    Flag.withAlias("j"),
    Flag.withDescription("Output machine-readable JSON"),
    Flag.optional,
  ),
});
const globalFlags = [nonInteractiveFlag, jsonFlag, verboseFlag, debugFlag, quietFlag] as const;
Command.withGlobalFlags(globalFlags);

// Per-command flags — add to Command.make() for commands that need them.
// Flag values are explicit handler arguments, not read from a service.
Command.make("install", {
  source: Argument.string("source").pipe(...),
  yes: yesFlag,
  force: forceFlag,
  preview: previewFlag,
}, (config) =>
  withRuntime(
    Effect.gen(function* () {
      if (config.preview) { /* show plan only */ }
      yield* handleInstall({ source: config.source });
    }),
    { command: "skills install" },
  ),
);
```

---

## Error Handling

### Three-Channel Error Pattern

Errors are routed to three channels to serve both humans and machines:

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
| 130  | SIGINT (Ctrl+C)                           |

### Run Boundary

`Command.runWith()` handles `--help` and `--version` automatically. The
production entry point uses `runCliMain` from `@axm.sh/core/unstable/cli-runtime`,
which owns signal handling, three-channel error routing, and graceful shutdown.

Output format must be resolved _before_ Effect runs (raw argv scan) because CLI
parse failures (`CliError.UnrecognizedOption`, `CliError.MissingOption`, etc.)
happen before any handler or `GlobalFlag.setting` executes. Without pre-Effect
format detection, those errors cannot route to the correct output channel.

```typescript
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { CliOutput, Command } from "effect/unstable/cli";
import { runCliMain } from "@axm.sh/core/unstable/cli-runtime";
import { InteractiveRenderer, MachineRenderer } from "@axm.sh/core/unstable/cli-renderer";

const VERSION = "0.0.1";

// Resolve format OUTSIDE Effect — must work even when CLI parsing fails
const hasExplicitJsonFlag = (args: ReadonlyArray<string>): boolean =>
  args.includes("--json") || args.includes("-j");

export const run = async (args: ReadonlyArray<string> = process.argv.slice(2)): Promise<void> => {
  await runCliMain(
    (argv) => {
      const isJson = hasExplicitJsonFlag(argv);
      const commandProgram = Command.runWith(rootCommand, { version: VERSION })(argv);
      const rendererLayer = isJson ? MachineRenderer() : InteractiveRenderer();

      return commandProgram.pipe(
        Effect.provide(
          Layer.mergeAll(
            baseLayer,
            rendererLayer,
            CliOutput.layer(makeAxmFormatter({ json: isJson })),
          ),
        ),
      );
    },
    { args },
  );
};
```

The entry point file uses `#!/usr/bin/env bun` shebang and `void run()` to
invoke the async function without awaiting at top level. Keep that file
trivial. Put root composition in `app.ts` and runtime/error wiring in
`runtime.ts`.

See `packages/cli-spike/src/app.ts` and `packages/cli-spike/src/runtime.ts`
for the current format-aware run boundary and runtime wiring.

Format errors with recovery guidance:

```
✗ Could not find configuration file
  Looked for: ./axm.config.ts, ./axm.config.json
  Run 'axm init' to create one.
```

### Error Handling Checklist

- [ ] **Exit 0/1/2** — Success=0, runtime=1, usage=2, signal=130
- [ ] **What happened** — Error explains what went wrong
- [ ] **How to fix** — Error suggests resolution
- [ ] **Effect errors mapped** — Typed errors mapped to user-facing messages
- [ ] **Format-aware routing** — JSON errors on stdout in json/stream-json modes
- [ ] **Pre-Effect format detection** — Output format resolved before Effect runs

---

## Structured Output

Handlers are format-agnostic. `CliRenderer` owns channel discipline — text
mode uses Clack terminal UI, JSON mode emits structured data. Handlers do not
branch on format; the renderer does.

### Command Handler Pattern

```typescript
(config) =>
  withRuntime(
    Effect.gen(function* () {
      const renderer = yield* CliRenderer;

      const pets = yield* renderer.withSpinner(
        `Logging intake from ${config.source}`,
        (handle) =>
          Effect.gen(function* () {
            yield* handle.update("Downloading intake sheet...");
            yield* handle.update("Registering pets...");
            return yield* IntakeService.process(config.source, config.habitat);
          }),
        { successMessage: "Intake complete" },
      );

      yield* renderer.success(renderText(config.source, pets));
    }),
    { command: "pets intake" },
  ),
```

For commands that support `--json` output with structured result data:

```typescript
const renderer = yield * CliRenderer;
const document = {
  _version: 1,
  command: "skills.list",
  items,
  count: items.length,
};

if (yield * renderer.result(document, SkillsListOutputSchema)) {
  return;
}

yield * renderer.table(items, columns, "Installed skills");
```

### Output Schema Convention

Every CLI transport envelope includes `_version: 1` for schema evolution. Use
`Schema.NullOr()` instead of optional properties when you want an always-present
payload key.

```typescript
export const SkillsListOutputSchema = Schema.Struct({
  _version: Schema.Literal(1),
  command: Schema.Literal("skills.list"),
  items: Schema.Array(SkillInfoSchema),
  count: Schema.Number,
});
```

### Long-Running Commands (NDJSON)

Long-running commands emit progress events before the final result. See
`packages/cli-spike/src/root/pets/intake.ts` for the complete pattern.

---

## Imports

All CLI APIs come from `effect/unstable/cli`. Node services from
`@effect/platform-node`. Local imports use `.js` extensions (TypeScript module
resolution):

```typescript
// Leaf commands
import * as Console from "effect/Console";
import { Argument, Command, Flag } from "effect/unstable/cli";

// app.ts
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import { CliOutput, Command } from "effect/unstable/cli";

import { runCliMain } from "@axm.sh/core/unstable/cli-runtime";
import { makeAxmFormatter } from "./formatter.js";
```

---

## Testing Commands

Test Effect handlers independently of CLI parsing using `@effect/vitest`:

```typescript
import { it } from "@effect/vitest";
import * as Layer from "effect/Layer";

// Handler unit test — uses it.effect, not manual Effect.runPromise
it.effect("installs skill", () =>
  Effect.gen(function* () {
    const result = yield* handleInstall({
      source: "owner/repo",
      scope: "project",
      skill: [],
      all: false,
    });
    expect(result).toEqual({ installed: true });
  }).pipe(Effect.provide(Layer.succeed(SkillService, testService))),
);
```

Use `it.effect` for handler unit tests. For end-to-end coverage, distinguish
between spike-only subprocess smoke tests and shipped CLI distribution E2E
tests. The spike keeps a colocated subprocess test in `src/main.test.ts`
because it is a reference app. Shipping CLIs keep built-artifact E2E tests in
`packages/<cli>-e2e/`.

### Testing Checklist

- [ ] **Handler unit tests** — Effect handlers tested via `it.effect` from
      `@effect/vitest`, independently of CLI parsing
- [ ] **Test layers provided** — Handler tests provide test layers
- [ ] **Spike smoke tests** — Reference-app subprocess coverage stays near the
      spike when it teaches CLI behavior
- [ ] **Distribution E2E tests** — Built artifact tested in `packages/<cli>-e2e/` (zero internal deps)

## Prompt Approaches

Two prompt approaches coexist. Match the approach of the package you're working in.

|                    | Primary CLI (`packages/cli/`)                                                        | CLI Spike (`packages/cli-spike/`)                           |
| ------------------ | ------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| **Core surface**   | `@axm.sh/core/unstable/cli/prompt` helpers for command-local prompt flows            | Same helpers plus native `Prompt` composition               |
| **Legacy/test**    | `CliPrompt` from `@axm.sh/core/unstable/cli-prompt` for shared adapters/tests        | Not used for normal spike commands                          |
| **Flag bypass**    | `fromFlagOrInteractivePrompt(value, Prompt.text(...), { message })`                  | Same                                                        |
| **Auto-confirm**   | `fromInteractivePrompt(Prompt.confirm(...), { message })` or `AxmPrompt.autoConfirm` | Same                                                        |
| **Custom prompts** | `AxmPrompt.selectKey(...)`                                                           | `AxmPrompt.selectKey(...)`                                  |
| **Cancellation**   | `PromptCancelled`                                                                    | `PromptCancelled` via `runPrompt` / `fromInteractivePrompt` |

```typescript
// CLI Spike / command-local prompt flow
import { Prompt } from "effect/unstable/cli";
import {
  AxmPrompt,
  fromFlagOrInteractivePrompt,
  fromInteractivePrompt,
} from "@axm.sh/core/unstable/cli/prompt";

const name =
  yield *
  fromFlagOrInteractivePrompt(args.name, Prompt.text({ message: "Pet name:" }), {
    message: "Pet name:",
  });
const ok =
  yield *
  fromInteractivePrompt(
    Prompt.confirm({ message: "Proceed?" }).pipe(AxmPrompt.autoConfirm(args.yes)),
    { message: "Proceed?" },
  );
```
