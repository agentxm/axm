---
type: Architecture
status: stable
description: Human and machine output responsibilities, channel boundaries, and contract authority.
depends-on:
  - ../principles.md
  - ../decisions/cli-output-view-model-and-terminal-ownership.md
  - ../decisions/cli-live-event-contract.md
  - ../decisions/cli-ledger-grammar-and-application-owned-prompts.md
---

# CLI output

Human terminal output and machine output are separate product surfaces built
from the same operation result. Neither is a serialization of the other.

## Responsibilities

This document explains the responsibilities of the output components and
routes to their executable contracts.

## Non-responsibilities

It does not inventory commands, fields, schemas, event variants, or renderer
APIs. Effect schemas and the command-output contract register retain their
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

Human presentation is a growing transcript with one bounded active region.
The Screen folds lifecycle events losslessly, appends meaningful phase
conclusions and exceptions, and selects the current activity or interaction.
The Frame serializes writes and owns only the geometry of that transient tail.
It cannot fold or repaint committed history. Measurements update current
activity without adding a line per tick. The authoritative result prints after
every lossless subscriber has drained, so it follows the story already told.

A ledger is useful for reviewing several proposed changes or comparing final
outcomes. Progress does not require a ledger, and a scalar or single outcome
need not be rendered as one. A plan and result may repeat identities because
they answer different questions; prior stderr narration never suppresses a
fact required to understand stdout.

## Channel boundaries

The binding channel-separation obligations are the executable output
specifications `cli/machine-errors-use-the-stable-envelope`,
`cli/machine-mode-never-prompts`, and `cli/exit-codes-match-published-reference`
in the
[specification catalog](../../../specifications/catalog.md), together with
their process-boundary end-to-end evidence; the separation below projects
them. This document explains how the output components realize those
obligations.

- Human stdout presents the command's primary result. A result ledger prints
  there whole, so it stands alone when stdout is piped. Lint findings are
  lint's primary result, so human lint output writes its findings ledger to
  stdout, not stderr, and `axm lint > findings.txt` captures them.
- Machine stdout emits one complete schema-backed document for a successful
  non-streaming invocation.
- Diagnostics, progress, warnings, and logs use stderr and never corrupt the
  primary stdout result. Machine progress on stderr is the encoded lifecycle
  event, one event per line, in the order core published it; the executable
  specification `cli/machine-progress-events-follow-the-lifecycle-schema` owns
  that contract and `cli/long-running-operations-emit-lifecycle-events` owns
  which operations must publish.
- `--quiet` suppresses routine progress and successful-unit detail. It retains
  the requested result or value, required review and external-action
  instructions, and actionable failures: affected identity, available reason,
  state disposition, safe request identifier, and applicable recovery. A quiet
  wait has its static instructions and no live countdown. An allowed required
  question remains operable.
- Unexpected failure still produces a stable machine error envelope while
  retaining diagnostics on stderr. Recognized errors may add a schema-backed
  `problem` discriminant whose fields expose structured facts beyond the stable
  category, title, and detail. Unsupported workspace lockfile versions use
  this field to report the lockfile path, observed version, supported version,
  and `older` or `newer` direction.

Handlers produce structured results before rendering. Feature-owned views turn
those results into typed human documents, and the application-owned `Screen` is
the sole writer after runtime startup. It serializes stdout and stderr,
maintains the accumulating transcript, gives an open question or wait
foreground ownership, and restores terminal state on shutdown. Nested
operations have scoped owners; finishing one does not clear another's
interaction.
Views do not write directly to process streams or derive machine data by parsing
terminal text.

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

Effect schemas own published wire shapes. The single register in
`apps/cli/src/machine-output-contracts.ts` classifies every command path by
result family, explicit liveness, and representative human and machine
scenarios. Tests compare it with the real command tree. Formatter help,
version, usage errors, and explicit raw credential output retain their own
contracts.

The executable specifications `cli/output-preserves-committed-history`,
`cli/results-stand-alone-on-stdout`, and `cli/quiet-keeps-actionable-results`
own the cross-cutting human promises. Layout and existing machine, approval,
credential, failure, and recovery specifications continue to own their
respective obligations.

Contract changes follow the executable specification
`system/process/pre-launch-changes-stay-coherent`, in the
[specification catalog](../../../specifications/catalog.md).
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

## Command authoring

Ordinary handlers call `emitResult(value, schema, () => humanDoc)`. The human
factory is pure and lazy, so machine mode never builds or executes a human
view. A final human document contains the facts needed when stdout is captured
alone. Credential delivery keeps its specialized acknowledged-write path;
raw content keeps the route's exact-byte and sanitization contract.

Use `withLiveOperation` around observed work, preserving the core lifecycle
stream and its drain-before-result boundary. Publish domain phases where the
work happens; do not create fake units to obtain a spinner. A completed read,
download, or verification is finished work, not evidence that an extension was
installed. The typed domain result owns the verdict.

Use `Screen.note` for durable context and diagnostics, `Screen.instruction`
for required action, and `Screen.ask` or `Screen.wait` for interaction. Required
action is explicit; it is never inferred by searching text for URLs or command
names. Review content prints before the question and remains in history.

Handlers do not import Frame, output streams, raw terminal input, or terminal
control sequences. Runtime adapters own those mechanics, and lint enforces
the boundary. Add a command's output and liveness decision to the existing
register, connect representative scenarios to real tests, and use terminal
replay when asserting that committed text survives repainting. A final string
or ANSI-stripped log alone cannot prove that history remained visible.
