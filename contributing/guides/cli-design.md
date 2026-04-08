---
status: active
last-reviewed: 2026-04-08
version: 0.2.0
description: CLI command design conventions for command shape, flags, prompts, and handler structure
depends-on:
  - ../../CLAUDE.md
  - ./cli-renderer.md
---

# CLI Design Guide

Conventions for designing `axm` commands as a clear human interface and a
stable command surface. This guide is the entry point for command authoring:
shape, naming, flags, prompts, validation, and handler boundaries. It covers
how commands are authored and how they behave for users and agents.

Does not cover machine-readable output contracts — see
[CLI Renderer Guide](./cli-renderer.md) for JSON document shapes, error
payloads, and stderr event contracts.

## Key Resources

- [CLI Renderer Guide](./cli-renderer.md) — Machine-readable output contracts
  and renderer boundaries
- [Testing Guide](./testing.md) — Handler and CLI testing guidance
- [Effect CLI API docs](https://effect-ts.github.io/effect/effect/unstable/cli/) —
  Command, flag, and help APIs
- [Command Line Interface Guidelines](https://clig.dev/) — CLI design
  principles
- [Clack Documentation](https://bomb.sh/docs/clack/) — Prompt and terminal UI
  primitives

## Skills

| Skill                                                            | Command | Description                                              |
| ---------------------------------------------------------------- | ------- | -------------------------------------------------------- |
| [cli-conventions](../../.claude/skills/cli-conventions/SKILL.md) | —       | Effect CLI + Effect patterns, command structure, testing |

---

## Quick Example

_Illustrates: "Noun-verb naming," "Positional for primary input," and "Flags
for optional behavior"_

_Before_ — Verb-first naming with flags for primary input:

```
axm install-skill --name @craig/my-skill --from github --force-overwrite
```

_After_ — Noun-verb naming with positional primary input:

```
axm skills install @craig/my-skill --force
```

The before example buries the resource in the verb, uses flags for the obvious
primary input, and couples source into a flag. The after example follows
`<resource> <action>`, uses a positional for the one obvious input, and keeps
`--force` for optional behavior only.

---

## Guide Split

Use the two CLI guides like this:

- `cli-design.md` — how commands are authored and how they behave
- `cli-renderer.md` — what machines can rely on from stdout and stderr

If a question starts with "how should this command read or behave for a user?",
it belongs here. If it starts with "what exact JSON or event shape do we
guarantee?", it belongs in [CLI Renderer Guide](./cli-renderer.md).

At the output boundary: commands decide whether they are human-only or
JSON-capable, and handlers build structured results before rendering.
`CliRenderer` owns channel discipline and wire format — see
[CLI Renderer Guide](./cli-renderer.md) for document shapes, error payloads,
and stderr contracts.

---

## Design Principles

Four principles ground the conventions in this guide. When a command design
question isn't covered by a specific rule, reason from these principles.

1. **Discoverability** — Users find commands through exploration. Consistent
   noun-verb naming, helpful parent commands, and clear `--help` output let
   users navigate without reading docs first.

2. **Scriptability** — Every command works in scripts and CI without human
   interaction. Non-interactive mode is a first-class path, not an afterthought.

3. **Consistency** — Same patterns across all commands. Flag meanings are
   stable, command shapes are predictable, and error behavior follows the same
   rules everywhere.

4. **Progressive disclosure** — Simple usage is simple. Common paths need
   minimal flags; advanced options exist but don't clutter the default
   experience.

### Design Principles Checklist

- [ ] **Discoverable** — Command is findable through help, tab-completion, and
      consistent naming
- [ ] **Scriptable** — Command works without human interaction when
      `--non-interactive` is set
- [ ] **Consistent** — Command follows the same shape, flag, and behavior
      patterns as peer commands
- [ ] **Progressively disclosed** — Common path needs minimal arguments;
      advanced options don't clutter defaults

---

## Architecture

_Context for the conventions that follow — describes where things live, not what
to verify._

`effect/unstable/cli` owns parsing. Effect handlers own business logic.

- Root command tree lives in `packages/cli/src/app.ts`
- Each leaf command is a single file defining args, flags, and handler wiring
- Global flags are registered once on the root command
- Handlers accept parsed values at the boundary and return Effects
- Layers provide dependencies at the edge

The parsing/handler boundary is the central architectural constraint. Parsing
concerns stay at the command boundary; domain work lives in handlers and
services. See [Handlers](#handlers) for why this separation matters and the
[Handler Checklist](#handler-checklist) for verification.

---

## Command Shape

Noun-verb naming (`<resource> <action>`) is more discoverable than verb-first
because users think "what thing?" before "what action?". Tab-completion works
naturally when resources group their actions — `axm skills<tab>` shows all skill
operations. Shallow hierarchy keeps commands typeable and memorable.

Examples:

- `axm skills install <source>`
- `axm packs new <name>`
- `axm auth whoami`

### Command Shape Checklist

- [ ] **Noun-verb order** — Command follows `<resource> <action>` pattern
- [ ] **Shallow hierarchy** — Command tree is 2-3 levels deep
- [ ] **Kebab-case names** — Command names use kebab-case
- [ ] **Positional primary input** — One obvious primary input uses a positional
      argument
- [ ] **Flags for options** — Multiple values and optional behavior use flags,
      not positionals

---

## File Organization

One file per leaf command makes commands discoverable in the file system, reduces
merge conflicts during parallel work, and keeps tests colocated with the code
they exercise.

Typical layout:

```text
src/root/
  skills/
    command.ts
    install.ts
    list.ts
    update.ts
```

### File Organization Checklist

- [ ] **One file per leaf** — Each leaf command is a single file
- [ ] **Group uses command.ts** — Parent/group command lives in `command.ts`
- [ ] **Single export** — Leaf files export one command
- [ ] **Colocated tests** — Tests live next to the command file
- [ ] **Local helpers** — Shared helpers stay inside the feature folder

---

## Parent Commands

Users who type a group command without a subcommand are exploring. Failing with
an error punishes exploration and teaches users to avoid typing partial
commands. Showing help rewards exploration and builds confidence in the CLI's
discoverability.

When a user runs a group command without a subcommand:

- Show help
- Exit successfully (exit code 0)
- List the available subcommands
- Include example usage

### Parent Command Checklist

- [ ] **Shows help** — Displays help text when run without a subcommand
- [ ] **Exits successfully** — Exit code is 0, not an error
- [ ] **Lists subcommands** — Available subcommands are visible in output
- [ ] **Includes examples** — Shows example usage for common operations

---

## Flags

Consistent flag semantics let users build intuition. When `--force` means the
same thing on every command, users transfer knowledge instead of memorizing
per-command exceptions. Agents benefit even more — they can apply a single
mental model across the entire CLI.

Effect CLI provides built-in `--help` and `--version`. `axm` adds a small set
of global and per-command flags.

### Global Flags

Registered once at the root:

- `--non-interactive`
- `--json`
- `--verbose`
- `--debug`
- `--quiet`

### Per-Command Flag Semantics

Reusable per-command flags live in `@axm.sh/core/unstable/cli-flags`. Their
meanings are fixed across all commands:

| Flag             | Behavior                                                      | Does NOT imply |
| ---------------- | ------------------------------------------------------------- | -------------- |
| `--yes` / `-y`   | Skips confirmation prompts only                               | `--force`      |
| `--force` / `-f` | Overrides blocking constraints (conflicts, existing files)    | `--yes`        |
| `--preview`      | Display-only; no side effects unless followed by confirmation | —              |

`--yes` answers "are you sure?" prompts. `--force` pushes past "this will
overwrite X" blockers. They are independent — forcing past a blocker still
requires confirmation unless `--yes` is also passed.

Machine-output rules for `--json` live in
[CLI Renderer Guide](./cli-renderer.md).

### Flags Checklist

- [ ] **Reserved shorts honored** — Does not reuse reserved short flags
      (`-y`, `-f`, `-h`, `-v`)
- [ ] **Consistent meaning** — Flag means the same thing across all commands
      that use it
- [ ] **Supported behavior** — Flag is only exposed when the command implements
      the behavior
- [ ] **Blocker/warning split** — Blockers produce errors; non-blockers produce
      warnings

---

## Handlers

Handlers are the effectful entry points for command behavior. The
parsing/handler boundary is the most important architectural constraint in the
CLI: it determines whether command logic is testable, composable, and
maintainable.

Separating parsing from domain logic makes handlers testable with direct Effect
invocation (no CLI framework needed) and composable across invocation paths
(CLI, programmatic, future API). When domain logic lives inside `Command.make`,
it can only be exercised by parsing command-line arguments.

### Handler Flow

1. Parse at the command boundary (`Command.make`)
2. Map parsed values into handler arguments
3. Run domain logic through services
4. Render through `CliRenderer` once at the end

Per-command flag values are passed as explicit handler arguments, not read from
a service.

### Output Boundary

Handlers build structured results before rendering. Commands decide whether they
are human-only or JSON-capable. `CliRenderer` owns channel discipline and wire
format — see [CLI Renderer Guide](./cli-renderer.md) for the full contract.

### Handler Checklist

- [ ] **Parsed input only** — Handler accepts domain values, not raw argv or
      CLI framework types
- [ ] **Domain via services** — Business logic lives in Effect services, not
      inline in the handler
- [ ] **Returns Effect** — Handler returns an Effect with typed error channel
- [ ] **Dependencies via layers** — Runtime dependencies are requested through
      Effect layers
- [ ] **Explicit flag args** — Flag values are passed as handler arguments, not
      read from a service
- [ ] **Renders once** — Output rendering happens once at the end, not
      interleaved with logic
- [ ] **No Command.make logic** — `Command.make` contains only argument parsing
      and handler wiring

---

## Prompts

Prompt behavior is part of command design, not an afterthought. `axm` is used
by both humans and AI agents — agents and CI runners cannot answer interactive
prompts, so every command must have a fully non-interactive path.

Non-interactive mode is detected via a resolution chain: explicit
`--non-interactive` flag → `CI=true` environment variable → `!stdin.isTTY`.

Use prompts to resolve missing choices, not to hide essential command behavior.

### Prompts Checklist

- [ ] **Non-interactive safe** — No prompt blocks in non-interactive mode
- [ ] **Flag fallback** — Every required prompt has a flag or non-interactive
      path
- [ ] **--yes scope** — `--yes` only answers confirmation prompts, not input
      prompts
- [ ] **Clear failure** — Missing required input in non-interactive mode
      produces a clear error message

---

## Validation

Parse-time validation catches syntax errors with immediate, precise messages
("expected a number, got 'abc'"). Handler-time validation catches semantic
errors with domain context ("skill @foo/bar not found in registry"). Mixing
these confuses the user about what went wrong — was my input malformed, or was
the operation invalid?

Use Effect CLI for argument and flag validation at parse time, then enforce
cross-field and business rules in handlers.

Parse-time tools:

- `Flag.choice()` for enums
- `Flag.optional` for optional flags
- `Flag.withDefault()` for defaults
- `Argument.optional` for optional positionals

Do not encode complex business validation in parser combinators when it belongs
in handler logic.

### Validation Checklist

- [ ] **Parse-time syntax** — Argument and flag validation uses Effect CLI
      combinators
- [ ] **Handler-time semantics** — Cross-field and business rules validate in
      handlers
- [ ] **No complex parsing** — Business validation is not encoded in parser
      combinators

---

## Testing Expectations

Changed command behavior needs tests. Tests validate that commands behave
correctly for users, not that internal handler structure is arranged a
particular way. See [Testing Guide](./testing.md) for depth.

### Testing Checklist

- [ ] **Handler tests** — Changed handler behavior has unit tests with Effect
      test layers
- [ ] **Behavioral assertions** — Tests assert observable behavior, not internal
      structure
- [ ] **JSON output tests** — JSON-capable commands have machine-output tests
- [ ] **E2E for material changes** — Shipped behavior changes have E2E coverage

---

## Common Pitfalls

| Pitfall                    | Example                                                            | Problem                                                         |
| -------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------- |
| Group commands that fail   | `axm skills` → error exit                                          | Punishes exploration; users expect help output                  |
| Inconsistent flag meanings | `--force` skips confirmations in one command, overrides in another | Users can't build intuition; scripts break when switching       |
| Parser types in handlers   | Handler receives `Options` object from CLI framework               | Couples domain logic to CLI framework; handler can't be reused  |
| Mixed rendering            | Business logic interleaved with `console.log`                      | Output is unstructured; `--json` can't work; tests need stdout  |
| Premature `--json`         | `--json` flag advertised before result schema exists               | Consumers depend on unstable shape; breaking changes inevitable |
| Formatted machine output   | JSON contains ANSI codes or table formatting                       | Parsers break; consumers must strip presentation artifacts      |

### Pitfalls Checklist

- [ ] **No failing group commands** — Parent commands show help and exit
      successfully
- [ ] **No flag meaning drift** — Each flag has one meaning across all commands
- [ ] **No parser types in handlers** — Handlers accept domain values, not
      framework types
- [ ] **No mixed rendering** — Business logic and output rendering are separated
- [ ] **No premature --json** — JSON output only advertised after schema is
      published
- [ ] **No formatted machine output** — JSON contains data, not presentation
      artifacts

---

## Command Design Quality Checklist

Use this when designing or reviewing CLI commands. References the section
checklists above.

### Section Checklists Verified

- [ ] **Design Principles Checklist** — All items pass
- [ ] **Command Shape Checklist** — All items pass
- [ ] **File Organization Checklist** — All items pass
- [ ] **Parent Command Checklist** — All items pass
- [ ] **Flags Checklist** — All items pass
- [ ] **Handler Checklist** — All items pass
- [ ] **Prompts Checklist** — All items pass
- [ ] **Validation Checklist** — All items pass
- [ ] **Testing Checklist** — All items pass
- [ ] **Pitfalls Checklist** — All items pass

---

## See Also

- [CLI Renderer Guide](./cli-renderer.md) — stdout/stderr and JSON contracts
- [Testing Guide](./testing.md) — Handler and CLI tests
- [Feature Delivery Guide](./feature-delivery.md) — Delivery checks around
  behavior changes
