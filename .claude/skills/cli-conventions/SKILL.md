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
> and patterns. Start with `src/main.ts` for the entry point overview.

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

`Command.runWith()` handles `--help` and `--version` automatically. Resolve
the output format _before_ Effect runs (raw argv scan) so errors from CLI
parsing can still be routed to the correct channel:

```typescript
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import { CliError, Command } from "effect/unstable/cli";

const VERSION = "0.0.1";

// Resolve format OUTSIDE Effect — must work even when CLI parsing fails
const hasExplicitJsonFlag = (args: ReadonlyArray<string>): boolean =>
  args.includes("--json") || args.includes("-j");

const resolveFormatFromArgv = (args: ReadonlyArray<string>): OutputFormat =>
  hasExplicitJsonFlag(args) ? "json" : "text";

const run = async (args: ReadonlyArray<string> = process.argv.slice(2)): Promise<void> => {
  const format = resolveFormatFromArgv(args);
  try {
    await Effect.runPromise(
      withGracefulShutdown(
        Command.runWith(rootCommand, { version: VERSION })(args).pipe(
          Effect.provide(NodeServices.layer),
        ) as Effect.Effect<void>,
      ),
    );
  } catch (error) {
    handleError(error, format);
  }
};

void run();
```

The entry point file uses `#!/usr/bin/env bun` shebang and `void run()` to
invoke the async function without awaiting at top level.

See `packages/cli-spike/src/main.ts` for the full three-channel error handler
implementation with format-aware routing.

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
const json = Option.getOrElse(yield * jsonFlag, () => false);

if (json) {
  yield * renderer.result(data, OutputSchema);
} else {
  yield * renderer.success(`Pet: ${data.name}`);
  yield * renderer.info(`Species: ${data.species}`);
}
```

### Output Schema Convention

Every JSON output includes `_version: 1` for schema evolution. Use
`Schema.NullOr()` instead of optional properties — always-present keys give
consumers a stable shape.

```typescript
export const SkillInfoSchema = Schema.Struct({
  _version: Schema.Literal(1),
  name: Schema.String,
  version: Schema.NullOr(Schema.String), // null, not omitted
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

// main.ts
#!/usr/bin/env bun
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import { CliError, Command, Flag, GlobalFlag } from "effect/unstable/cli";

import { skillsCommand } from "./commands/skills/command.js";
```

---

## Testing Commands

Test Effect handlers independently of CLI parsing:

```typescript
// Effect handler test (no CLI parsing)
it("installs skill", async () => {
  const TestLayer = Layer.succeed(SkillService, mockService);
  const result = await Effect.runPromise(
    handleInstall({ source: "owner/repo", scope: "project", skill: [], all: false }).pipe(
      Effect.provide(TestLayer),
    ),
  );
  expect(result).toEqual({ installed: true });
});
```

### Testing Checklist

- [ ] **Handler unit tests** — Effect handlers tested independently of CLI parsing
- [ ] **Test layers provided** — Handler tests provide test layers
- [ ] **Co-located E2E tests** — CLI tested via subprocess for user-visible behavior (`*.e2e.test.ts`)
- [ ] **Distribution E2E tests** — Built artifact tested in `packages/<cli>-e2e/` (zero internal deps)
