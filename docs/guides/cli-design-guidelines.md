---
status: active
description:
  Reference for designing and reviewing CLI features—command structure, flags,
  prompts, output components, and shell autocompletions for yargs-based CLI
  applications using bomb.sh tooling.
---

# CLI Design Guidelines

Conventions for CLI design _beyond_ what yargs provides automatically. For yargs
API patterns, see the
[official documentation](https://github.com/yargs/yargs/blob/main/docs/api.md).

---

## yargs + Effect Architecture

yargs handles argument parsing; Effect handles business logic. Use typed
`CommandModule` with separate handler functions for testability:

```typescript
import type { CommandModule } from "yargs";
import { Effect } from "effect";

// 1. Define args interface
interface DeployArgs {
  target: string;
  env: string;
}

// 2. Pure Effect handler (testable without yargs)
const handleDeploy = (args: DeployArgs) =>
  Effect.gen(function* () {
    // Business logic here
  });

// 3. CommandModule wires yargs to handler
export const deployCommand: CommandModule<{}, DeployArgs> = {
  command: "deploy <target>",
  describe: "Deploy to target environment",
  builder: (yargs) =>
    yargs
      .positional("target", {
        type: "string",
        describe: "Deployment target",
        demandOption: true,
      })
      .option("env", {
        type: "string",
        describe: "Environment",
        default: "staging",
      }),
  handler: async (argv) => {
    await Effect.runPromise(
      handleDeploy({ target: argv.target, env: argv.env }),
    );
  },
};
```

The `CommandModule<ParentArgs, ThisArgs>` generic provides full type
inference—no casts needed in the handler.

### yargs Quick Reference

| Concept             | Note                                                         |
| ------------------- | ------------------------------------------------------------ |
| **positional()**    | Required/optional set by command syntax (`<arg>` vs `[arg]`) |
| **variadic**        | Use `<args..>` for array of values                           |
| **demandOption**    | Only works with `.option()`, not `.positional()`             |
| **CommandModule<>** | First generic: parent args; second: this command's args      |
| **Deprecated**      | Avoid `.demand()`, `.defaults()`, `.require()`               |

For TypeScript, install `@types/yargs` and see the
[yargs TypeScript guide](https://github.com/yargs/yargs/blob/main/docs/typescript.md).

### Architecture Checklist

- [ ] **Bun runtime** — Uses Bun for fast startup and built-in TypeScript
- [ ] **yargs for parsing** — Type-safe argument parsing via yargs
- [ ] **Effect for logic** — Command handlers are Effect programs
- [ ] **Handler separation** — Effect handler functions separate from
      CommandModule for testability
- [ ] **Typed CommandModule** — Uses `CommandModule<ParentArgs, Args>` generics
- [ ] **Deprecated methods avoided** — Uses `demandOption` not
      `demand`/`require`

---

## Command Structure and Naming

```bash
# Noun-verb structure with flags over positionals
mycli <resource> <action> [flags]
mycli deploy create --env staging

# Use flags for clarity when multiple values needed
mycli migrate --from mydb --to production  # Not: mycli migrate mydb production
```

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
src/commands/
├── extensions.ts           # Parent command (axm extensions)
├── extensions/             # Subcommands folder
│   ├── create.ts           # axm extensions create
│   ├── list.ts             # axm extensions list
│   └── utils.ts            # Shared utilities for extensions subcommands
├── init.ts                 # Standalone command (no subcommands)
└── version.ts
```

Parent commands compose subcommands via `.command()` and use
`.demandCommand(1, "message")` to require a subcommand.

### Command Utilities

Place a `utils.ts` file inside subcommand folders when subcommands share common
functionality. Scope utilities to that command group only—cross-cutting
utilities belong in `src/lib/` or similar. Typical utilities include: resource
managers, shared validation helpers, common output formatters, and
domain-specific lookups.

### File Organization Checklist

- [ ] **Parent alongside folder** — `extensions.ts` next to `extensions/` folder
- [ ] **Tests colocated** — Test files alongside implementation
- [ ] **CommandModule exports** — Each file exports a typed `CommandModule`
- [ ] **Scoped utils** — Shared utilities in `utils.ts` within subcommand folder

---

## Help Text Design

yargs generates help automatically. Enhance with `.example()` and `.epilog()`:

```typescript
yargs(hideBin(process.argv))
  .usage("$0 <command> [options]")
  .example("$0 deploy web --env staging", "Deploy web app to staging")
  .epilog("Learn more: https://docs.example.com/cli")
  .demandCommand(1, "Please specify a command to run");
```

### Help Text Checklist

- [ ] **Examples included** — 2-3 realistic examples via `.example()`
- [ ] **Discoverable** — Running `mycli` alone shows help, not an error
- [ ] **Empty invocation exits 0** — Informational, not an error
- [ ] **Epilog for docs** — Links to full documentation

---

## Parent Command Behavior

Parent commands (and the root command) should welcome users when invoked without
arguments—help them discover what's available rather than scold them for not
knowing. As [clig.dev](https://clig.dev/) puts it: "concise guidance at first
invocation helps users learn your program conversationally."

```bash
# ❌ Feels like an error (avoid)
$ mycli extensions
Error: Please specify a command
Run 'mycli extensions --help' for usage

# ✅ Feels like a menu (preferred)
$ mycli extensions
Manage extensions for AI coding agents.

Commands:
  mycli extensions add <source>   Add an extension
  mycli extensions list           List installed extensions
  mycli extensions remove <name>  Remove an extension

Examples:
  mycli extensions add ./my-ext   Add from local path
  mycli extensions list           Show all extensions

Run 'mycli extensions <command> --help' for detailed usage.
```

The concise welcome should include:

- **Description** — What this command group does
- **Available subcommands** — What actions are available
- **Example or two** — Common usage patterns
- **Pointer to more help** — How to get detailed information

### Implementation

Override the default `demandCommand` error behavior to show help and exit
cleanly:

```typescript
export const extensionsCommand: CommandModule = {
  command: "extensions",
  describe: "Manage extensions for AI coding agents",
  builder: (yargs) =>
    yargs
      .command(addCommand)
      .command(listCommand)
      .command(removeCommand)
      .demandCommand(1)
      .fail((msg, err, yargs) => {
        if (msg?.includes("Not enough non-option arguments")) {
          yargs.showHelp();
          process.exit(0); // Welcome, not an error
        }
        console.error(msg);
        process.exit(1);
      }),
  handler: () => {},
};
```

### Parent Command Checklist

- [ ] **Welcome, don't scold** — No arguments shows help, exits 0
- [ ] **Shows subcommands** — Lists available actions
- [ ] **Includes examples** — 1-2 common usage patterns
- [ ] **Points to more help** — Tells user how to get detailed usage

---

## Standard Flags

yargs provides `--help` and `--version` automatically. Implement these
additional flags when needed:

| Flag                | Short | Purpose                       | Notes                           |
| ------------------- | ----- | ----------------------------- | ------------------------------- |
| `--verbose`         | `-v`  | Increase output detail        | Use `type: "count"` for `-vvv`  |
| `--quiet`           | `-q`  | Suppress non-essential output | Use `conflicts: "verbose"`      |
| `--json`            |       | Output as JSON                | Essential for scripting         |
| `--no-color`        |       | Disable colored output        | Also respect `NO_COLOR` env var |
| `--non-interactive` |       | Disable all prompts           | Required for CI                 |
| `--yes`             | `-y`  | Skip confirmations            | Required for CI automation      |

### `--quiet` Behavior

| Suppressed by `--quiet`      | NOT suppressed            |
| ---------------------------- | ------------------------- |
| Progress spinners            | Final results/output      |
| Phase messages               | Errors and warnings       |
| Informational status updates | Content written to stdout |

### Reserved Short Flags

Use `-V` for version to free `-v` for verbose: `.alias("V", "version")`.

### Standard Flags Checklist

- [ ] **--verbose/-v** — Stackable verbosity via `type: "count"`
- [ ] **--quiet/-q** — Suppresses non-essential output
- [ ] **--json** — Machine-readable output for scripting
- [ ] **--yes/-y** — Skips confirmations for CI automation
- [ ] **Reserved letters honored** — No conflicts with `-h`, `-V`, `-v`, `-q`,
      `-y`

---

## Interactive Prompts

Use [@clack/prompts](https://bomb.sh/docs/clack/packages/prompts/) for all
interactive input. Clack provides consistent, accessible prompts with built-in
cancellation handling and TypeScript support.

### Why Clack

Prompts are a user experience boundary—inconsistent styling or missing
cancellation support breaks trust. Clack handles edge cases (terminal resize,
Ctrl+C, piped input) so command authors focus on business logic.

### Prompt Patterns

```typescript
import * as p from "@clack/prompts";
import { Effect } from "effect";

// Wrap prompts in Effect for consistent error handling
const askEnvironment = Effect.tryPromise({
  try: () =>
    p.select({
      message: "Select environment",
      options: [
        { value: "staging", label: "Staging" },
        { value: "production", label: "Production", hint: "requires approval" },
      ],
    }),
  catch: () => new PromptCancelledError(),
});

// Check for cancellation
const result = await p.text({ message: "Project name?" });
if (p.isCancel(result)) {
  p.cancel("Operation cancelled.");
  process.exit(0);
}
```

### Non-Interactive Mode

Commands must work without prompts when `--non-interactive` is set or stdin is
not a TTY. Provide all promptable values as flags:

```typescript
// If interactive, prompt for missing values; otherwise, require flags
if (process.stdin.isTTY && !argv.nonInteractive) {
  env = await askEnvironment();
} else if (!argv.env) {
  console.error("Error: --env required in non-interactive mode");
  process.exit(1);
}
```

### Interactive Prompts Checklist

- [ ] **Uses clack** — All prompts use `@clack/prompts`, not readline or inquirer
- [ ] **Cancellation handled** — `p.isCancel()` checked after every prompt
- [ ] **Cancel exits 0** — User cancellation exits cleanly, not as error
- [ ] **Non-interactive fallback** — Every prompt has an equivalent flag
- [ ] **TTY detection** — Prompts only shown when `process.stdin.isTTY`
- [ ] **CI compatible** — Missing required input in CI shows error with flag name

---

## Workflow Automation Flags

Staged workflow pattern for commands that generate output to be persisted:

```bash
mycli generate report              # Preview only (default)
mycli generate report --apply      # Write to files
mycli generate report --apply --commit  # Write and git commit
```

Use `implies: "apply"` on `--commit` to enforce dependency. Distinguish from
`--yes`: use `--apply` for "perform the write," `--yes` for "skip confirmation."

### Workflow Automation Checklist

- [ ] **Preview default** — Without `--apply`, results displayed only
- [ ] **Commit requires apply** — `--commit` uses `implies: "apply"`
- [ ] **Idempotent apply** — Running `--apply` multiple times produces same
      result

---

## Output Conventions

Stream separation enables scripting: data to stdout, diagnostics to stderr.

```typescript
if (process.stdout.isTTY) {
  // Interactive: colors, spinners, tables
} else {
  // Piped: plain text, no ANSI codes, one item per line
}
```

### Color Semantics

| Color  | Usage    | Color     | Usage                 |
| ------ | -------- | --------- | --------------------- |
| Red    | Errors   | Blue/Cyan | Information           |
| Yellow | Warnings | Gray/Dim  | Secondary information |
| Green  | Success  |           |                       |

Colors disabled when: `NO_COLOR` set, `TERM=dumb`, `--no-color`, or non-TTY.

### Output Checklist

- [ ] **stdout for data** — Results written to stdout for piping
- [ ] **stderr for diagnostics** — Progress, spinners, errors to stderr
- [ ] **TTY adaptive** — Rich output in TTY, plain text when piped
- [ ] **NO_COLOR respected** — Colors disabled when `NO_COLOR` env var set
- [ ] **JSON takes precedence** — `--json` outputs JSON regardless of TTY

---

## Output Components

Use clack's output components for consistent status communication. These
complement the TTY-adaptive patterns above.

### Spinners

Spinners indicate ongoing work. They write to stderr and auto-clear on
completion:

```typescript
import * as p from "@clack/prompts";

const spin = p.spinner();
spin.start("Deploying to staging");
await deploy();
spin.stop("Deployed successfully");
```

Spinners are suppressed by `--quiet` (show only final result).

### Progress Bars

For operations with known completion percentage:

```typescript
const progress = p.progress({ max: files.length });
progress.start("Processing files");
for (const file of files) {
  await processFile(file);
  progress.increment();
}
progress.stop("Processed all files");
```

### Structured Messages

Use semantic log functions for consistent styling:

```typescript
p.intro("mycli v1.0.0");
p.log.info("Connected to database");
p.log.warn("Rate limit approaching");
p.log.error("Connection failed");
p.log.success("Migration complete");
p.outro("Done!");
```

### Output Components Checklist

- [ ] **Spinners for async** — Long-running operations show spinner
- [ ] **Spinners to stderr** — Spinners never interfere with piped stdout
- [ ] **Quiet suppresses spinners** — `--quiet` hides spinners, shows final result
- [ ] **Progress for known bounds** — Operations with known count use progress bar
- [ ] **Semantic log levels** — Uses `p.log.info/warn/error/success` appropriately
- [ ] **Intro/outro framing** — Multi-step commands use `intro`/`outro` for context

---

## Error Handling and Exit Codes

| Code | Meaning                                   |
| ---- | ----------------------------------------- |
| 0    | Success (including `--help`, `--version`) |
| 1    | Error (validation, runtime, any failure)  |
| 130  | SIGINT (Ctrl+C)                           |

Use `.fail()` to customize error handling. Pass `false` to enable try/catch. For
testing, use `.exitProcess(false)` and `.fail(false)`.

### Error Message Format

```
✗ Could not find configuration file
  Looked for: ./mycli.config.ts, ./mycli.config.json
  Run 'mycli init' to create one.
```

Map Effect typed errors to user-facing messages with recovery actions.

### Error Handling Checklist

- [ ] **Exit 0/1** — Success exits 0, all errors exit 1
- [ ] **What happened** — Error explains what went wrong
- [ ] **How to fix** — Error suggests resolution
- [ ] **Effect errors mapped** — Typed errors mapped to user-facing messages

---

## Testing Commands

Test yargs validation and Effect handlers separately. This separation enables
fast, focused tests without process lifecycle complexity.

### yargs Validation Tests

Test argument parsing by creating an isolated parser with process.exit disabled:

```typescript
import yargs from "yargs";
import { describe, it, expect } from "vitest";
import { deployCommand } from "./deploy.js";

describe("deploy command validation", () => {
  const createParser = () =>
    yargs().command(deployCommand).exitProcess(false).fail(false);

  it("requires target positional", () => {
    expect(() => createParser().parse("deploy")).toThrow(
      /Not enough non-option arguments/,
    );
  });

  it("accepts valid arguments", () => {
    const argv = createParser().parse("deploy production --env staging");
    expect(argv.target).toBe("production");
    expect(argv.env).toBe("staging");
  });
});
```

### Effect Handler Tests

Test handlers directly with mocked services—no yargs involved:

```typescript
import { Effect, Layer } from "effect";
import { describe, it, expect } from "vitest";
import { handleDeploy } from "./deploy.js";

describe("handleDeploy", () => {
  it("deploys to target environment", async () => {
    const TestLayer = Layer.succeed(DeployService, mockDeployService);

    const result = await Effect.runPromise(
      handleDeploy({ target: "production", env: "staging" }).pipe(
        Effect.provide(TestLayer),
      ),
    );

    expect(result).toEqual({ deployed: true });
  });
});
```

### Testing Checklist

- [ ] **Parser isolation** — Tests create fresh yargs instance per test
- [ ] **Exit disabled** — Uses `.exitProcess(false)` to prevent process.exit()
- [ ] **Fail disabled** — Uses `.fail(false)` to throw errors instead of logging
- [ ] **Handler unit tests** — Effect handlers tested independently of yargs
- [ ] **Services mocked** — Handler tests use test layers, not real services

---

## CI and Automation Mode

Detect CI via: `CI`, `GITHUB_ACTIONS`, `GITLAB_CI`, `CIRCLECI`, `JENKINS_URL`,
`TF_BUILD`, `BUILDKITE`.

### CI Checklist

- [ ] **CI detected** — Detects CI via standard env vars
- [ ] **No prompts in CI** — Prompts fail with error explaining required flags
- [ ] **Explicit flags required** — Destructive operations require `--yes` in CI
- [ ] **Idempotent** — Commands safe to run multiple times with same result

---

## Configuration Hierarchy

Precedence (highest to lowest): CLI flags → env vars → project config → user
config → defaults.

Use `.env("MYCLI")` for automatic env var loading (`MYCLI_*`). Use XDG base
directories for config (`~/.config/mycli`), data (`~/.local/share/mycli`), and
cache (`~/.cache/mycli`).

### Configuration Checklist

- [ ] **Flags highest priority** — CLI flags override all other config
- [ ] **Env vars prefixed** — Environment variables prefixed with tool name
- [ ] **XDG compliant** — Uses XDG base directories
- [ ] **No secrets in flags** — Secrets via env vars or `--token-file`

---

## Validation

Use `choices` for enums, `.check()` for complex validation, `.conflicts()` for
mutually exclusive options, `.implies()` for dependencies. Use `as const` with
`choices` for type inference.

Use `strict()` by default. Use `strictCommands()` when passing through options
to another tool.

### Validation Checklist

- [ ] **Choices for enums** — Uses `choices` for enumerated options
- [ ] **Conflicts declared** — Mutually exclusive options use `.conflicts()`
- [ ] **Implies for deps** — Dependent options use `.implies()`
- [ ] **Strict mode enabled** — `strict()` or variant enabled

---

## Internal vs External CLI

| Aspect        | Internal CLI               | External CLI                        |
| ------------- | -------------------------- | ----------------------------------- |
| **Stability** | Can break between versions | SemVer strict, deprecation warnings |
| **Errors**    | Stack traces OK            | Clean, actionable messages          |
| **Telemetry** | Built-in analytics OK      | Opt-in only, privacy notice         |

Use `deprecated` property on commands for deprecation warnings.

---

## Shell Autocompletions

Shell autocompletions make CLIs discoverable. Use
[@bomb.sh/tab](https://bomb.sh/docs/tab/) to provide completions across zsh,
bash, fish, and powershell from a single definition.

### Why Autocompletions Matter

Users expect Tab to work. Without completions, users must consult `--help`
repeatedly. Tab reduces cognitive load and prevents typos in flag names and
enum values.

### Integration Pattern

Tab works alongside yargs—yargs parses arguments, tab provides completions:

```typescript
import t from "@bomb.sh/tab";

// Define completions that mirror yargs commands
const cli = t.program("mycli");

const deploy = cli.command("deploy", "Deploy to environment");
deploy.option("env", "Target environment", (complete) => {
  complete("staging", "Deploy to staging");
  complete("production", "Deploy to production");
});
deploy.option("region", "AWS region", async (complete) => {
  const regions = await fetchRegions(); // Dynamic completions
  regions.forEach((r) => complete(r.id, r.name));
});

// Handle completion requests in CLI entry point
if (process.argv.includes("complete")) {
  await t.handle(cli);
  process.exit(0);
}
```

### User Setup

Document the setup command for users:

```bash
# Add to shell profile
eval "$(mycli complete zsh)"   # zsh
eval "$(mycli complete bash)"  # bash
mycli complete fish | source   # fish
```

### Shell Autocompletions Checklist

- [ ] **Tab integration** — Uses `@bomb.sh/tab` for shell completions
- [ ] **Mirrors yargs** — Completion definitions match yargs command structure
- [ ] **All shells supported** — Works with zsh, bash, fish, powershell
- [ ] **Dynamic values** — Enum options and choices have completions
- [ ] **Setup documented** — README includes shell setup instructions
- [ ] **Complete subcommand** — CLI exposes `complete <shell>` for script generation

---

## See Also

- [yargs GitHub](https://github.com/yargs/yargs) — Complete API documentation
- [Command Line Interface Guidelines (clig.dev)](https://clig.dev/) — CLI design
  philosophy
- [Clack Documentation](https://bomb.sh/docs/clack/) — Interactive prompts and
  output components
- [Tab Documentation](https://bomb.sh/docs/tab/) — Shell autocompletion
  integration
