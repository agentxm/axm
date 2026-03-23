---
name: cli-conventions
description: Effect CLI + Effect architecture. Use when adding commands, defining flags, or wiring handlers. Covers file organization, argument/flag patterns, and testing.
user-invocable: false
---

# CLI Design Conventions

Apply these conventions when working on CLI commands.

> **Reference implementation:** `packages/cli-spike` — a working spike proving
> out idiomatic `effect/unstable/cli` patterns.

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
├── main.ts                     # Root command, global flags, run()
└── commands/
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

## Global Flags

Defined once in `main.ts`, registered on the root command, yielded in any
handler:

```typescript
import * as Effect from "effect/Effect";
import { Command, Flag, GlobalFlag } from "effect/unstable/cli";

const nonInteractiveFlag = GlobalFlag.setting("app-non-interactive")({
  flag: Flag.boolean("non-interactive").pipe(
    Flag.optional,
    Flag.withDescription("Disable all interactive prompts"),
  ),
});

const yesFlag = GlobalFlag.setting("app-yes")({
  flag: Flag.boolean("yes").pipe(
    Flag.withAlias("y"),
    Flag.withDescription("Auto-accept confirmation prompts"),
  ),
});

const forceFlag = GlobalFlag.setting("app-force")({
  flag: Flag.boolean("force").pipe(
    Flag.withAlias("f"),
    Flag.withDescription("Override constraints that would cause failure"),
  ),
});

const previewFlag = GlobalFlag.setting("app-preview")({
  flag: Flag.boolean("preview").pipe(Flag.withDescription("Display plan without applying")),
});

const globalFlags = [nonInteractiveFlag, yesFlag, forceFlag, previewFlag] as const;

const rootCommand = Command.make("axm").pipe(
  Command.withDescription("Open agent extension manager"),
  Command.withExamples([
    { command: "axm skills list", description: "List installed skills" },
    { command: "axm skills install owner/repo", description: "Install skills from GitHub" },
  ]),
  Command.withSubcommands([skillsCommand]),
  Command.withGlobalFlags(globalFlags),
);

// In any leaf command handler — yield to access global flags
(config) =>
  Effect.gen(function* () {
    const yes = yield* yesFlag;
    const preview = yield* previewFlag;
    if (preview) {
      /* show plan only */
    }
  });
```

---

## Error Handling

| Code | Meaning         |
| ---- | --------------- |
| 0    | Success         |
| 1    | Error           |
| 130  | SIGINT (Ctrl+C) |

`Command.runWith()` handles `--help` and `--version` automatically. Catch
`CliError` at the `run()` boundary:

```typescript
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import { CliError, Command } from "effect/unstable/cli";

const VERSION = "0.0.1";

const run = async (args: ReadonlyArray<string> = process.argv.slice(2)): Promise<void> => {
  try {
    await Effect.runPromise(
      Command.runWith(rootCommand, { version: VERSION })(args).pipe(
        Effect.provide(NodeServices.layer),
      ) as Effect.Effect<void>,
    );
  } catch (error) {
    if (CliError.isCliError(error)) {
      process.exit(1);
    }
    console.error(error);
    process.exit(1);
  }
};

void run();
```

The entry point file uses `#!/usr/bin/env bun` shebang and `void run()` to
invoke the async function without awaiting at top level.

Format errors with recovery guidance:

```
✗ Could not find configuration file
  Looked for: ./axm.config.ts, ./axm.config.json
  Run 'axm init' to create one.
```

### Error Handling Checklist

- [ ] **Exit 0/1** — Success exits 0, all errors exit 1
- [ ] **What happened** — Error explains what went wrong
- [ ] **How to fix** — Error suggests resolution
- [ ] **Effect errors mapped** — Typed errors mapped to user-facing messages

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
- [ ] **E2E tests** — Full CLI binary tested via subprocess for user-visible behavior
