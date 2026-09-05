---
type: Architecture
status: stable
description: Human and machine output responsibilities, channel boundaries, and contract authority.
depends-on:
  - ../principles.md
  - ../decisions/cli-output-view-model-and-terminal-ownership.md
  - ../decisions/cli-live-event-contract.md
---

# CLI output

Human terminal output and machine output are separate product surfaces built
from the same operation result. Neither is a serialization of the other.

## Responsibilities

This document explains the responsibilities of the output components and
routes to their executable contracts.

## Non-responsibilities

It does not inventory commands, fields, schemas, event variants, or renderer
APIs. Effect schemas and the machine-output contract register retain their
declared interface authority. Executable specifications own observable
obligations; command help and ordinary tests explain or witness them.

[CLI help](help.md) owns discovery and the relationship among root help,
command help, topics, and contextual navigation. This document owns how those
surfaces use human and machine output channels, not how help requests resolve.
[Terminal design](terminal-design.md) owns how the human document is chosen
and painted, and [Interaction](interaction.md) owns when a prompt may open.

## Two feature-to-output contracts

Features reach output through exactly two typed contracts. The settled result
crosses as a `Doc` tree, the typed document a feature-owned view builds from
the operation result. Live progress crosses as the lifecycle event stream, a
schema-backed sequence of operation, phase, unit, waiting, and settled events
that every long-running operation publishes to an invocation-scoped broadcast
([CLI live-event contract](../decisions/cli-live-event-contract.md)). Neither
contract carries terminal escapes, padding, or wording; the painter and the
phrase layer beside it own those.

The two contracts do not overlap in time. The live frame renders the event
stream while an operation runs and collapses into the transcript when the
operation settles; the settled document prints only after every lossless
subscriber of the stream has drained.

## Channel boundaries

The binding channel-separation obligations are the executable output
specifications `cli/machine-errors-use-the-stable-envelope`,
`cli/machine-mode-never-prompts`, and `cli/exit-codes-match-published-reference`
in the
[specification catalog](../../../specifications/catalog.md), together with
their process-boundary end-to-end evidence; the separation below projects
them. This document explains how the output components realize those
obligations.

- Human stdout presents the command's primary result.
- Machine stdout emits one complete schema-backed document for a successful
  non-streaming invocation.
- Diagnostics, progress, warnings, and logs use stderr and never corrupt the
  primary stdout result. Machine progress on stderr is the encoded lifecycle
  event, one event per line, in the order core published it; the executable
  specification `cli/machine-progress-events-follow-the-lifecycle-schema` owns
  that contract and `cli/long-running-operations-emit-lifecycle-events` owns
  which operations must publish.
- Unexpected failure still produces a stable machine error envelope while
  retaining diagnostics on stderr. Recognized errors may add a schema-backed
  `problem` discriminant whose fields expose structured facts beyond the stable
  category, title, and detail. Unsupported workspace lockfile versions use
  this field to report the lockfile path, observed version, supported version,
  and `older` or `newer` direction.

Handlers produce structured results before rendering. Feature-owned views turn
those results into typed human documents, and the application-owned `Screen`
is the sole writer after runtime startup. It serializes stdout and stderr,
maintains the append-only transcript and bottom live frame, coordinates
prompts, and restores terminal state on shutdown. Views do not write directly
to process streams or derive machine data by parsing terminal text.

Interactive and plain modes paint the same human document. Interactive mode
may add color and animate the live frame only when the target stream is a TTY;
plain mode emits static text without cursor movement. Color capability and
animation capability are separate so forced color does not imply a live
terminal. A stream that is not a terminal receives no styling and is never
wrapped, truncated, or padded to a terminal width; the executable
specification `cli/non-tty-output-is-plain-and-unpadded` owns that property.

Workspace mutations report the plan and artifacts AXM applied locally. A
Registry administration command instead reports the authoritative remote
transition: its target, before and after state, disposition, and resulting
revision. A remote-only transition is not represented as a local workspace
plan because it creates no local artifact.

## Contract authority

Effect schemas own published wire shapes. The machine-output contract register
classifies every command path and tests compare it with the real command tree,
so a command cannot silently acquire or lose a machine contract.

Contract changes follow the executable specification
[`system/process/pre-launch-changes-stay-coherent`](../../../specifications/system/process/pre-launch-changes-stay-coherent.spec.ts).
Before public launch, a change updates the canonical schema, affected producers
and consumers, specifications, fixtures, and generated artifacts together.

Human wording and layout can change independently of the machine schema. The
typed human document is not a wire format, and machine output is not derived
from it. Exact fields and observable output obligations remain with their
executable authorities.

## Interaction

Preview, confirmation, execution, and rendering refer to one operation
candidate. Machine mode never prompts (the executable specification
`cli/machine-mode-never-prompts` owns the obligation); the conditions under
which a prompt may open belong to [Interaction](interaction.md). Cancellation,
blocked work, partial progress, rollback, and
interruption remain distinct outcomes when the underlying operation
distinguishes them.

For closure-based operations, human and machine results identify each closure
as applied, no-op, blocked, failed, or rolled back. Overall nonzero exit status
means the complete request did not converge; it does not imply that no
independent closure committed.
