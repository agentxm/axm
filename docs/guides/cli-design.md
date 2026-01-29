# CLI Design Guide

Conventions for designing CLI commands in this project. Covers yargs + Effect
architecture, command structure, interactive prompts with Bombshell, output
formatting, and error handling.

**Not covered:** yargs API details (see
[official docs](https://github.com/yargs/yargs/blob/main/docs/api.md)), shell
autocompletion setup, or testing strategies. For testing CLI commands, see the
testing guidelines.

---

## yargs + Effect Architecture

yargs handles argument parsing; Effect handles business logic. The key pattern
is separating the `CommandModule` (yargs wiring) from the Effect handler
function—this enables testing handlers independently without yargs lifecycle
complexity.

For the complete architecture pattern with code examples, see the
`/cli-conventions` skill.

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

Commands follow a noun-verb structure: `mycli <resource> <action> [flags]`. Use
flags over positionals when multiple values are needed—flags are self-documenting
while positionals rely on order.

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

### File Organization Checklist

- [ ] **Parent alongside folder** — `extensions.ts` next to `extensions/` folder
- [ ] **Tests colocated** — Test files alongside implementation
- [ ] **CommandModule exports** — Each file exports a typed `CommandModule`
- [ ] **Scoped utils** — Shared utilities in `utils.ts` within subcommand folder

---

## Parent Command Behavior

Parent commands (and the root command) should welcome users when invoked without
arguments—help them discover what's available rather than scold them for not
knowing. As [clig.dev](https://clig.dev/) puts it: "concise guidance at first
invocation helps users learn your program conversationally."

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

yargs provides `--help` and `--version` automatically.

| Flag                | Short | Purpose                       |
| ------------------- | ----- | ----------------------------- |
| `--verbose`         | `-v`  | Increase output detail        |
| `--quiet`           | `-q`  | Suppress non-essential output |
| `--json`            |       | Output as JSON                |
| `--non-interactive` |       | Disable all prompts           |
| `--yes`             | `-y`  | Skip confirmations            |

### `--quiet` Behavior

| Suppressed by `--quiet`      | NOT suppressed            |
| ---------------------------- | ------------------------- |
| Progress spinners            | Final results/output      |
| Phase messages               | Errors and warnings       |
| Informational status updates | Content written to stdout |

Use `-V` for version to free `-v` for verbose: `.alias("V", "version")`.

### Standard Flags Checklist

- [ ] **--verbose/-v** — Stackable verbosity via `type: "count"`
- [ ] **--quiet/-q** — Suppresses non-essential output
- [ ] **--json** — Machine-readable output for scripting
- [ ] **--yes/-y** — Skips confirmations for CI automation
- [ ] **Reserved letters honored** — No conflicts with `-h`, `-V`, `-v`, `-q`,
      `-y`

---

## Interactive Prompts with Bombshell

Use [@clack/prompts](https://bomb.sh/docs/clack/packages/prompts/) for all
interactive input. Clack provides consistent, accessible prompts with built-in
cancellation handling and TypeScript support.

### Why Clack

Prompts are a user experience boundary—inconsistent styling or missing
cancellation support breaks trust. Clack handles edge cases (terminal resize,
Ctrl+C, piped input) so command authors focus on business logic.

### Wrapping Prompts with Effect

Bombshell prompts return `Promise<T | symbol>` where the symbol indicates
cancellation. Wrapping with Effect provides:

- Typed errors for cancellation (catchable, not just a symbol check)
- Composition with other Effects (sequencing, fallbacks, retries)
- Testability via dependency injection
- Consistent error handling across the CLI

The key insight is that `p.isCancel()` must be checked after each prompt—the
symbol return indicates user cancellation (Ctrl+C, Escape).

For wrapping patterns and code examples, see the `/bombshell` skill.

### Prompt Error Types

Three error types cover all prompt failure modes:

- **UserCancelled** — User pressed Ctrl+C or Escape during a prompt
- **PromptError** — Unexpected prompt failure (rare, usually TTY issues)
- **NotInteractiveError** — Attempted prompt in non-TTY environment

For error type definitions with code, see the `/bombshell` skill.

### Non-Interactive Mode

Commands must work without prompts when `--non-interactive` is set or stdin is
not a TTY. Every prompt should have a flag equivalent for CI/scripted use. The
`promptOrFlag` pattern provides this cleanly—flag values skip prompting
entirely, while missing flags trigger interactive prompts (with TTY check).

For non-interactive fallback pattern code, see the `/bombshell` skill.

### Interactive Prompts Checklist

- [ ] **Uses clack** — All prompts use `@clack/prompts`, not readline or inquirer
- [ ] **Cancellation handled** — `p.isCancel()` checked after every prompt
- [ ] **Cancel exits 0** — User cancellation exits cleanly, not as error
- [ ] **Non-interactive fallback** — Every prompt has an equivalent flag
- [ ] **TTY detection** — Prompts only shown when `process.stdin.isTTY`
- [ ] **CI compatible** — Missing required input in CI shows error with flag name
- [ ] **Typed errors** — UserCancelled, PromptError, NotInteractiveError extend
      TaggedError

---

## Output Components

Use clack's output components for consistent status communication.

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

Spinners are suppressed by `--quiet` (show only final result). For Effect
integration, the spinner helper wraps an Effect (not a Promise) so the spinner
integrates with Effect's error handling.

For spinner helper pattern code, see the `/bombshell` skill.

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

### Output Conventions

Stream separation enables scripting: data to stdout, diagnostics to stderr.
Adapt output based on TTY detection—rich output in interactive terminals, plain
text when piped.

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
- [ ] **Spinners for async** — Long-running operations show spinner
- [ ] **Semantic log levels** — Uses `p.log.info/warn/error/success` appropriately

---

## Error Handling and Exit Codes

| Code | Meaning                                   |
| ---- | ----------------------------------------- |
| 0    | Success (including `--help`, `--version`) |
| 1    | Error (validation, runtime, any failure)  |
| 130  | SIGINT (Ctrl+C)                           |

Use `.fail()` to customize error handling. Pass `false` to enable try/catch. For
testing, use `.exitProcess(false)` and `.fail(false)`.

For error message format examples, see the `/cli-conventions` skill.

### Error Handling Checklist

- [ ] **Exit 0/1** — Success exits 0, all errors exit 1
- [ ] **What happened** — Error explains what went wrong
- [ ] **How to fix** — Error suggests resolution
- [ ] **Effect errors mapped** — Typed errors mapped to user-facing messages

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

## Skills

- `/cli-conventions` — yargs + Effect patterns, command structure, testing
- `/bombshell` — Effect wrappers for prompts, TTY detection, spinners

## See Also

- [yargs GitHub](https://github.com/yargs/yargs) — Complete API documentation
- [Command Line Interface Guidelines (clig.dev)](https://clig.dev/) — CLI design
  philosophy
- [Clack Documentation](https://bomb.sh/docs/clack/) — Interactive prompts and
  output components
