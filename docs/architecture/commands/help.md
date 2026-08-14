---
status: stable
description: CLI help surfaces, resolution, authority, discoverability, and verification.
depends-on:
  - ./overview.md
  - ./output.md
  - ../principles.md
---

# CLI help and discoverability

AXM help is one connected discovery surface with several forms. Root help
orients a reader to the command families, command help describes an executable
interface, and help topics explain concepts, workflows, and schemas that do not
fit in a command signature. Keeping those jobs distinct makes each form useful
without making users learn unrelated navigation rules.

## Responsibilities

CLI help is responsible for:

- making every supported command and help topic discoverable from stable entry
  points;
- distinguishing command reference from conceptual and schema guidance;
- resolving help requests consistently when command and topic namespaces
  overlap;
- connecting related help surfaces through contextual suggestions and
  `LEARN MORE` links; and
- preserving the same navigational meaning in human and machine output.

Help describes the available interface and the context needed to choose an
operation. It does not execute an operation, inspect workspace state, or choose
user intent.

## Help surfaces

Each help form has one primary job:

| Surface                                                   | Job                                                                                   | Authority                                        |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `axm` and `axm --help`                                    | Orient users to AXM and its top-level command families.                               | The root command tree and formatter.             |
| Parent command invocation and `axm <command-path> --help` | Describe executable command paths, arguments, flags, subcommands, and examples.       | Command definitions and annotations.             |
| `axm help`                                                | List the available prose and schema topics.                                           | The generated topic registry.                    |
| `axm help <topic>`                                        | Present durable guidance or a raw schema that is broader than one command invocation. | Topic sources and schema sources.                |
| Suggestions and `LEARN MORE` sections                     | Move the reader to the next relevant command or topic without duplicating it.         | The command or diagnostic that owns the context. |

Command help is the canonical reference for an executable interface. A help
topic may explain why or when to use commands, but it does not maintain a copy
of their flags or complete signatures. Schema topics expose their canonical
schema rather than translating its fields into a second prose contract.

## Resolution and overlapping names

Command paths and topic names are separate namespaces and may overlap. For
example, a topic may explain an extension type while a command group with the
same name exposes its operations. The syntax keeps the unambiguous form of
each surface available:

- `axm <command-path> --help` always requests command help.
- `axm help <topic>` requests an exact topic when one exists.
- When no exact topic exists, `axm help <command-path>` resolves to the same
  semantic command-help document as the canonical `--help` form.

An exact topic therefore wins a collision. A colliding topic should point to
the canonical command-help form when the command surface is relevant. A valid
command path must never fail as merely an unknown topic, even when no prose
topic shares its name.

When neither namespace resolves, the failure distinguishes the unresolved
request and suggests valid command-help or topic-discovery entry points. A
special case may add contextual guidance, but it must not establish a different
resolution rule for one command.

## Authority and freshness

Help architecture owns the relationship among the surfaces, not their current
inventory or presentation details:

- The real command tree owns supported command paths and aliases.
- Command definitions own exact descriptions, arguments, flags, subcommands,
  and examples.
- Topic and schema sources own topic names and content; generated artifacts are
  derived copies.
- The formatter owns terminal layout and formatter-produced machine help
  documents.
- [CLI output](output.md) owns channel boundaries, envelopes, and the separation
  between human and machine presentation.
- Behavior and completeness tests own the exact supported results.

Indexes, suggestions, generated topic bundles, and tests derive their coverage
from those authorities. Architecture and prose documentation must not maintain
a parallel list of current commands, topics, flags, or schemas.

## Contextual navigation

Help links should answer the next likely information need without turning every
surface into a table of contents. Root and parent help orient broadly. Command
help links to the small number of topics needed to understand that command.
Topics link back to command help when readers need exact invocation details.
Diagnostics suggest a help surface only when it adds information relevant to
the observed failure.

These links provide context without prescribing a mutation. Invariant findings
remain factual; help explains the available concepts and interfaces from which
a user or agent can choose an ordinary operation.

## Human and machine help

Human and machine modes expose the same command identity, usage, arguments,
flags, subcommands, examples, and navigation targets when those elements are
present. Human output may optimize layout for scanning, while machine output
uses the formatter and renderer contracts defined by
[CLI output](output.md).

Help resolution itself does not depend on workspace validity, registry
authentication, or network access. A user must be able to understand an
invalid or offline workspace with the installed CLI's own command and topic
material.

## Non-responsibilities

CLI help does not own:

- operational behavior, recovery policy, or workspace inspection;
- exact command, flag, topic, schema, or output inventories;
- long-form product documentation outside the installed CLI;
- renderer implementation or terminal styling; or
- compatibility aliases that are not part of the accepted command tree.

Focused command and capability documents own operational responsibilities.
Executable definitions and tests own exact interface contracts.

## Verification obligations

Automated coverage should prove that:

- every canonical and aliased command path has command help in human and
  machine modes;
- the root and every parent command expose their registered children;
- every indexed topic resolves to its generated content;
- every command and topic reference emitted by help resolves;
- exact-topic, command-fallback, collision, and unknown-request resolution
  follow one policy;
- valid command-shaped help requests do not fall into generic unknown-topic
  recovery; and
- adding, removing, or renaming a command or topic cannot silently leave stale
  help navigation behind.

Tests compare generated and rendered surfaces with the real command tree and
topic registry. They do not reproduce those inventories manually.
