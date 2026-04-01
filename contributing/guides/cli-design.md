---
status: active
description: CLI command design conventions for command shape, flags, prompts, and handler structure
depends-on:
  - ../../CLAUDE.md
  - ./cli-renderer.md
---

# CLI Design Guide

Conventions for designing `axm` commands as a clear human interface and a
stable command surface. This guide is the entry point for command authoring:
shape, naming, flags, prompts, validation, and handler boundaries.

> [Handlers](../../CLAUDE.md#handlers) — critical guidance

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

## Guide Split

Use the two CLI guides like this:

- `cli-design.md` -> how commands are authored and how they behave
- `cli-renderer.md` -> what machines can rely on from stdout and stderr

If a question starts with "how should this command read or behave for a user?",
it belongs here. If it starts with "what exact JSON or event shape do we
guarantee?", it belongs in [CLI Renderer Guide](./cli-renderer.md).

---

## Architecture

`effect/unstable/cli` owns parsing. Effect handlers own business logic.

- root command tree lives in `packages/cli/src/app.ts`
- each leaf command is a single file that defines args, flags, and handler
  wiring
- global flags are registered once on the root command
- handlers accept parsed values at the boundary and return Effects
- layers provide dependencies at the edge

Keep parsing concerns at the command boundary. Keep domain work in handlers and
services.

---

## Command Shape

Prefer noun-verb commands with shallow hierarchy.

- use `<resource> <action>` naming
- keep hierarchy to 2-3 levels
- use kebab-case command names
- use positionals only for one obvious primary input
- prefer flags when multiple values or optional behavior are involved

Examples:

- `axm skills install <source>`
- `axm packs new <name>`
- `axm auth whoami`

---

## File Organization

Use one file per leaf command and keep nearby helpers local to the feature.

Typical layout:

```text
src/root/
  skills/
    command.ts
    install.ts
    list.ts
    update.ts
```

Rules:

- parent/group command uses `command.ts`
- leaf files export one command
- tests stay colocated
- shared helpers stay inside the feature folder

---

## Parent Commands

Parent commands should orient, not scold.

When a user runs a group command without a subcommand:

- show help
- exit successfully
- list the available subcommands
- include a couple of examples

Treat parent commands as menus.

---

## Flags

Effect CLI provides built-in `--help` and `--version`. `axm` adds a small set
of global and per-command flags.

### Global Flags

Registered once at the root:

- `--non-interactive`
- `--json`
- `--verbose`
- `--debug`
- `--quiet`

### Per-Command Flags

Reusable per-command flags live in `@axm.sh/core/unstable/cli-flags`.

- `--yes` / `-y` skips confirmations only
- `--force` / `-f` overrides blockers, but does not imply `--yes`
- `--preview` is display-only unless paired with explicit confirmation

### Flag Rules

- honor reserved short flags
- keep flag meanings consistent across resources
- expose a flag only when the command really supports the behavior
- treat blockers as errors and non-blockers as warnings

Machine-output rules for `--json` live in
[CLI Renderer Guide](./cli-renderer.md).

---

## Handlers

Handlers are the effectful entry points for command behavior.

Handler responsibilities:

- accept parsed input
- call domain services
- return Effects
- request dependencies through layers
- render once at the end

Avoid:

- reading raw argv inside handlers
- mixing prompt logic with parsing logic
- doing business logic directly in `Command.make(...)`

Recommended flow:

1. parse at the command boundary
2. map into handler args
3. run domain logic
4. render through `CliRenderer`

---

## Prompts

Prompt behavior is part of command design, not an afterthought.

- no prompt may block in non-interactive mode
- every required prompt must have a flag or another non-interactive path
- `--yes` only answers confirmation prompts
- commands should fail clearly when required input is missing in
  non-interactive mode

Use prompts to resolve missing choices, not to hide essential command behavior.

---

## Output Responsibilities

This guide only defines the boundary:

- commands decide whether they are human-only or JSON-capable
- handlers should build structured results before rendering
- `CliRenderer` owns channel discipline

The actual JSON document shape, error payload shape, and stderr event contract
are defined in [CLI Renderer Guide](./cli-renderer.md).

---

## Validation

Use Effect CLI for argument and flag validation at parse time, then enforce
cross-field rules in handlers.

Use:

- `Flag.choice()` for enums
- `Flag.optional` for optional flags
- `Flag.withDefault()` for defaults
- `Argument.optional` for optional positionals

Do not encode complex business validation in parser combinators when it belongs
in handler logic.

---

## Testing Expectations

Changed command behavior needs tests.

- unit-test handlers with Effect test layers
- prefer behavioral assertions over structure assertions
- add machine-output tests for JSON-capable commands
- add E2E coverage when shipped CLI behavior changes materially

See [Testing Guide](./testing.md) for depth.

---

## Common Mistakes

- letting group commands fail instead of acting like menus
- adding flags that mean different things on different commands
- leaking raw parser types across handler boundaries
- mixing business logic and rendering line-by-line
- advertising `--json` before a command has a published result schema
- treating machine output as formatted human output

---

## See Also

- [CLI Renderer Guide](./cli-renderer.md) — stdout/stderr and JSON contracts
- [Testing Guide](./testing.md) — Handler and CLI tests
- [Feature Delivery Guide](./feature-delivery.md) — Delivery checks around
  behavior changes
