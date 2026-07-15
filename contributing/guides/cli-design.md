---
status: active
last-reviewed: 2026-07-14
version: 0.2.2
description: CLI command design conventions for command shape, flags, prompts, and handler structure
depends-on:
  - ../../CLAUDE.md
  - ./cli-renderer.md
---

# CLI Design Guide

Conventions for designing `axm` commands as a clear human interface and a
stable command surface. The primary value of this guide is as a **design
constraint**: it prevents command interfaces from diverging across resources,
keeping the CLI learnable and scriptable for both humans and agents.

This guide is the entry point for command authoring: shape, naming, flags,
prompts, validation, and handler boundaries.

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

### Command Shape

_Illustrates: "Noun-verb naming," "Positional for primary input," and "Flags
for optional behavior"_

_Before_ — Verb-first naming with flags for primary input:

```
axm-spike intake-pet --source partner-feed --habitat showroom --force-overwrite
```

_After_ — Noun-verb naming with positional primary input:

```
axm-spike pets intake partner-feed --habitat showroom --force
```

The before example buries the resource in the verb and uses flags for the obvious
primary input. The after example follows `<resource> <action>`, uses a positional
for the one obvious input, and keeps `--habitat` and `--force` for optional
behavior only.

### Handler Boundary

_Illustrates: "Handler boundary," "Render once," and "Domain via services"_

_Before_ — parsing, business logic, and rendering tangled together:

```typescript
Command.make("intake", { source: Argument.string("source").pipe(Argument.optional) }, (config) =>
  Effect.gen(function* () {
    // Parsing concern leaked into handler
    const src = config.source ?? (yield* prompt("Source URL or path:"));
    // Business logic mixed with rendering
    const pets = yield* fetchPetsFromSource(src);
    console.log(`Will intake ${pets.length} pets`);
    if (!(yield* confirm("Proceed?"))) return;
    for (const pet of pets) {
      yield* registerPet(pet);
      console.log(`  ✓ ${pet.name}`); // Line-by-line rendering
    }
  }),
);
```

_After_ — typed config at the boundary, services for domain work, `CliRenderer`
for output (based on `cli-spike/src/root/pets/intake.ts`):

```typescript
const intakeConfig = {
  source: Argument.string("source").pipe(
    Argument.withDescription("Partner intake feed, local file, or URL"),
  ),
  habitat: Flag.choice("habitat", ["showroom", "foster"] as const).pipe(
    Flag.withDefault("showroom" as const),
  ),
  yes: yesFlag,
} as const;

export const intakeCommand = Command.make("intake", intakeConfig, (config) =>
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
);
```

The before example tangles parsing, prompts, domain logic, and output. The after
example declares typed config at the command boundary, provides services via
`withRuntime`, delegates domain work to `IntakeService`, and renders once
through `CliRenderer`. The spinner is format-agnostic — text mode shows an
animated spinner; JSON mode emits NDJSON progress on stderr.

---

## Guide Scope

Use this guide and the related CLI guides like this:

| If the question starts with...                       | It belongs in...                                |
| ---------------------------------------------------- | ----------------------------------------------- |
| "How should this command read or behave for a user?" | This guide (`cli-design.md`)                    |
| "What exact JSON or event shape do we guarantee?"    | [CLI Renderer Guide](./cli-renderer.md)         |
| "How do I test this handler or command?"             | [Testing Guide](./testing.md)                   |
| "What Effect pattern should I use here?"             | [Effect Guide](./effect.md)                     |
| "Is this change ready to ship?"                      | [Feature Delivery Guide](./feature-delivery.md) |

At the output boundary: commands decide whether they are human-only or
JSON-capable, and handlers build structured results before rendering.
`CliRenderer` owns channel discipline and wire format — see
[CLI Renderer Guide](./cli-renderer.md) for JSON shapes, error payloads,
and stderr contracts.

Use suggestions for suggestive next steps after scaffold or recovery flows.
Keep `task` as a short verb slug (`edit`, `sync`, `login`), put nuance in
`description`, and set either `command` (argv array) or `cmd` (display string)
when the step is directly runnable.

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

Extension slash-command rendering is not governed by this guide. Command
package frontmatter is opaque agent-native data; renderers pass it through
verbatim and apply frontmatter `agentOverrides` as RFC 7396 merge patches.
`command.json` carries registry-facing metadata only.

The parsing/handler boundary is the central architectural constraint. Parsing
concerns stay at the command boundary; domain work lives in handlers and
services. See [Handlers](#handlers) for why this separation matters and the
[Handler Checklist](#handler-checklist) for verification.

**Depth note:** Not every command needs the same design effort. A simple
`pets list` needs minimal ceremony — one file, a couple of flags, no prompts.
A multi-step `pets intake` with source resolution, interactive pet selection,
and force-override earns a directory, dedicated helper tests, and careful flag
design. Scale effort to command complexity.

### Runtime Provision

The cli-spike uses a single `withRuntime()` wrapper that provides all services
and error handling. The production CLI follows the same default model, with one
additional auth-specific wrapper:

- **`withRuntime(command)`** — provides foundation services
  (`CliRenderer`, telemetry, error handling), selects the output format, and
  adds the registry/platform infrastructure used by most commands.
- **`withAuthRuntime(command)`** — same runtime boundary plus auth services for
  auth-only commands.
- **`withWorkspace(scope)`** — provides workspace read model, extension managers,
  and source resolution. Only commands that operate on a workspace use this.

Commands compose them in their handler callback:

```typescript
(config) =>
  handleInstall(config).pipe(
    withWorkspace(config.scope),
    withRuntime("skills install"),
  ),
```

Auth-only commands omit `withWorkspace` and use `withAuthRuntime("auth whoami")`
directly. Workspace services remain separate because they are materially more
expensive and not every command needs them.

### Shared Flags vs Global Flag Settings

Effect v4 offers two mechanisms for cross-command flags:

- **`Command.withSharedFlags()`** — Declares flags on a parent command.
  Subcommands access the parsed values by yielding the parent command
  (`yield* parentCommand`). Values are plain config, not services.
- **`GlobalFlag.setting()`** — Declares flags as Effect services. Handlers
  access them by yielding the service tag (`yield* jsonFlag`). Registered once
  on the root command.

The axm CLI uses `GlobalFlag.setting()` for all cross-cutting flags
(`--json`, `--non-interactive`, `--verbose`, `--debug`, `--quiet`). This is a
deliberate choice: global flag settings compose with Effect's service model,
work at any depth in the command tree without yielding a parent, and integrate
naturally with layer-based testing. `withSharedFlags` is not used in the axm
CLI.

### Help & Error Formatting

Effect v4 provides `CliOutput` as a service for customizing how `--help`,
`--version`, and CLI errors are rendered. The production CLI provides a custom
formatter via `CliOutput.layer(makeAxmFormatter({ json: isJson }))` at the
run boundary. This controls brand-consistent help output and ensures JSON-mode
`--help` emits structured data instead of ANSI text.

Top-level help is gh-style and grouped by the command groups declared in
`packages/cli/src/app.ts`. `axm`, `axm --help`, and `axm -h` should show the
same top-level help. `axm help` lists topic pages only. Per-command help stays
on Effect CLI defaults.

Markdown help topics live in `packages/cli/help/topics/<topic>.md`. Run
`pnpm nx run cli:generate-help-topics` after adding or editing a topic; build
also runs this target before compiling. Generated topic strings live in
`packages/cli/src/__generated__/help-topics.ts` and are bundled into the CLI.

Custom formatters implement `CliOutput.Formatter`:

```typescript
const formatter: CliOutput.Formatter = {
  formatHelpDoc: (doc) => /* ... */,
  formatCliError: (error) => /* ... */,
  formatVersion: (name, version) => /* ... */,
};
```

### Pre-Effect Format Detection

Output format is resolved _before_ Effect runs via raw argv scanning:

```typescript
const hasExplicitJsonFlag = (args: ReadonlyArray<string>): boolean =>
  args.includes("--json") || args.includes("-j");
```

This is required because CLI parse failures (`CliError.UnrecognizedOption`,
`CliError.MissingOption`) happen before any handler or `GlobalFlag.setting`
executes. Without pre-Effect detection, parse errors cannot route to the
correct output channel (JSON on stdout vs text on stderr).

---

## Command Shape

Noun-verb naming (`<resource> <action>`) is more discoverable than verb-first
because users think "what thing?" before "what action?". Tab-completion works
naturally when resources group their actions — `axm skills<tab>` shows all skill
operations. Shallow hierarchy keeps commands typeable and memorable.

Examples:

- `axm-spike pets intake <source>`
- `axm-spike pets register <name>`
- `axm-spike pets list`
- `axm-spike pets adopt <pet>`

Every leaf command should include at least one example via
`Command.withExamples()`. Examples are the primary way users learn commands from
`--help` output — they show real invocations rather than abstract syntax.

```typescript
Command.withExamples([
  { command: "axm skills install owner/repo", description: "Install interactively" },
  { command: "axm skills install owner/repo --all --yes", description: "Install all, no prompts" },
]),
```

### Command Shape Checklist

- [ ] **Noun-verb order** — Command follows `<resource> <action>` pattern
- [ ] **Shallow hierarchy** — Command tree is 2-3 levels deep
- [ ] **Kebab-case names** — Command names use kebab-case
- [ ] **Positional primary input** — One obvious primary input uses a positional
      argument
- [ ] **Flags for options** — Multiple values and optional behavior use flags,
      not positionals
- [ ] **Examples provided** — Every leaf command has at least one
      `Command.withExamples()` entry

---

## File Organization

One file per leaf command makes commands discoverable in the file system, reduces
merge conflicts during parallel work, and keeps tests colocated with the code
they exercise. Start with a flat file; promote to a directory only when
complexity demands it. Parent/group commands use `_<command>.ts` so they stand
out from leaf `command.ts` files inside promoted directories.

### Default: flat files

```text
src/root/
  pets/
    _pets.ts          # parent/group command
    intake.ts         # leaf: config + handler + helpers
    intake.test.ts
    list.ts
    register.ts
    adopt.ts
```

### When to promote to a directory

A leaf command earns its own directory when it has **testable helper logic that
is meaningfully independent** from the handler — e.g., source resolution with
multiple code paths, interactive pet selection, or intake plan construction
with its own edge cases. The bar is: the helper has enough branching to warrant
its own test file.

```text
src/root/
  pets/
    _pets.ts
    intake/
      command.ts                       # config + wiring only
      handler.ts                       # orchestration
      handler.test.ts
      resolve-intake-source.ts         # complex, independently testable
      resolve-intake-source.test.ts
    list.ts
    register.ts
    adopt.ts
```

A directory is not justified by:

- having a handler (every command has one — keep it in the same file)
- having an args interface (inline it or co-locate with the handler)
- having an intent type used in one place (inline it)
- wanting symmetry with other commands that are more complex

### Types and abstractions

- **Inline first.** If a type is used in one file, define it there. Do not
  create `intent.ts` for a single interface consumed by one neighbor.
- **Infer when possible.** Prefer Effect's type inference over explicit
  intermediate type aliases. Name a type when it appears in more than one file
  or clarifies a non-obvious contract.
- **Earn abstractions.** A shared generic workflow service earns its keep when
  three or more commands use it and their shared logic is non-trivial. Until
  then, inline the logic. Duplication across two commands is cheaper than a
  premature generic.
- **No ceremony.** Skip `@experimental` JSDoc on internal CLI code, section
  banner comments (`// -----`), and doc comments on self-evident interfaces.

### File Organization Checklist

- [ ] **One file per leaf** — Each leaf command defaults to a single file
- [ ] **Group uses \_name.ts** — Parent/group command lives in `_<command>.ts`
- [ ] **Single export** — Leaf files export one command
- [ ] **Colocated tests** — Tests live next to the command file
- [ ] **Local helpers** — Shared helpers stay inside the feature folder
- [ ] **Flat by default** — Leaf promoted to directory only when independently
      testable helpers emerge
- [ ] **No premature types** — Intermediate types are inferred or inline, not
      in separate files
- [ ] **Earned abstractions** — Shared services exist only when 3+ commands use
      non-trivial shared logic
- [ ] **No ceremony** — No `@experimental` JSDoc, section banners, or doc
      comments on self-evident interfaces

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
- `--json` / `-j`
- `--verbose` / `-v`
- `--debug`
- `--quiet` / `-q`

`--log-level` is not an axm global flag. Effect CLI currently bakes it in
automatically; AXM removes it from `GlobalFlag.BuiltIns` before command
construction. The canonical upstream history is
[Effect-TS/effect#6370](https://github.com/Effect-TS/effect/issues/6370).

### Per-Command Flag Semantics

Reusable per-command flags live in `@agentxm/client-core/unstable/cli-flags`. Their
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

### Effect v4 Native Prompts (CLI Spike)

The CLI spike uses Effect v4 native `Prompt` from `effect/unstable/cli`
directly. `Prompt` is `Yieldable`, but command-local flows should still prefer
the helper wrappers in `@agentxm/client-core/unstable/cli/prompt` when they need
non-interactive guards or flag bypasses.

> **Note:** `CliPrompt` still exists for shared interaction adapters and test
> harnesses in the primary CLI. New command-local prompt flows in both
> `packages/cli/` and `packages/cli-spike/` should usually use
> `requireInteractive` from `@agentxm/client-core/unstable/cli/prompt` and inline
> simple `Option.match` / length checks at the call site.

**Direct `yield* Prompt.xxx()`:**

```typescript
import { Prompt } from "effect/unstable/cli";
const name = yield * Prompt.text({ message: "Pet name:" });
```

**Non-interactive guard at call site:**

```typescript
import { requireInteractive } from "@agentxm/client-core/unstable/cli/prompt";

const name =
  yield *
  requireInteractive(Prompt.text({ message: "Pet name:" }), {
    message: "Pet name:",
  });
```

**Flag bypass stays explicit:**

```typescript
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { requireInteractive } from "@agentxm/client-core/unstable/cli/prompt";

const name =
  yield *
  Option.match(args.name, {
    onSome: Effect.succeed,
    onNone: () =>
      requireInteractive(Prompt.text({ message: "Pet name:" }), {
        message: "Pet name:",
      }),
  });
```

**`Prompt.all` for multi-field forms:**

```typescript
const info =
  yield *
  Prompt.all({
    name: Prompt.text({ message: "Name:" }),
    species: Prompt.select({ message: "Species:", choices }),
  });
```

**`Prompt.custom` for new prompt types** — see the `AxmPrompt` namespace in
`@agentxm/client-core/unstable/cli/prompt` for custom prompt implementations.

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

| Pitfall                     | Example                                                       | Problem                                                                 |
| --------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Group command fails         | `axm-spike pets` exits non-zero with no subcommand            | Scolds users instead of orienting; breaks scripted `--help` flows       |
| Inconsistent flag meaning   | `--force` skips confirms on one command, overrides on another | Users can't build muscle memory; scripts break across resources         |
| Raw parser types in handler | Handler receives `string \| undefined` instead of `Option`    | Parsing concern leaks past the boundary; handler logic gets noisy       |
| Line-by-line rendering      | `console.log` calls interleaved with business logic           | No structured result; can't switch to JSON output; hard to test         |
| Premature `--json`          | Flag advertised before a result schema exists                 | Machine consumers build on an unstable contract                         |
| Formatted machine output    | JSON piped through a human formatter                          | Breaks both audiences — unreadable for humans, unparseable for machines |
| Premature directory split   | `list/command.ts` + `list/handler.ts` for a 30-line command   | Extra files without testable complexity to justify them                 |
| Single-use named types      | `IntakeIntent` interface used in one file                     | Ceremony without value; clutters the module graph                       |
| Premature generic           | Shared workflow service used by two commands                  | Premature abstraction harder to change than duplicated code             |

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
- [ ] **No premature directories** — Leaf commands stay flat until independently
      testable helpers emerge
- [ ] **No single-use type files** — Types used in one file are defined inline
- [ ] **No premature generics** — Shared abstractions exist only when 3+
      commands use them

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

### Overall Quality

- [ ] **Depth proportional** — Design effort matches command complexity (simple
      commands need minimal ceremony; complex commands earn directories and tests)
- [ ] **Agent-consumable** — Consistent terminology throughout;
      counterintuitive conventions are explicit
- [ ] **Reference-aligned** — Cross-references to CLI Renderer, Testing, and
      Effect guides point to specific sections

---

## See Also

- [CLI Renderer Guide](./cli-renderer.md) — stdout/stderr and JSON contracts
- [Testing Guide](./testing.md) — Handler and CLI tests
- [Effect Layers Guide](./effect-layers.md) — Layer construction and CLI
  application patterns
- [Feature Delivery Guide](./feature-delivery.md) — Delivery checks around
  behavior changes
