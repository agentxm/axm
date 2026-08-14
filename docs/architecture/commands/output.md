---
status: stable
description: Human and machine output responsibilities, channel boundaries, and contract authority.
depends-on:
  - ../principles.md
---

# CLI output

Human terminal output and machine output are separate product surfaces built
from the same operation result. Neither is a serialization of the other.

## Responsibilities

This document owns the durable channel, authority, and evolution boundaries for
AXM output.

## Non-responsibilities

It does not inventory commands, fields, schemas, event variants, or renderer
APIs. Effect schemas, the machine-output contract register, command help, and
behavior tests own those exact contracts.

## Channel boundaries

- Human stdout presents the command's primary result.
- Machine stdout emits one complete schema-backed document for a successful
  non-streaming invocation.
- Diagnostics, progress, warnings, and logs use stderr and never corrupt the
  primary stdout result.
- Unexpected failure still produces a stable machine error envelope while
  retaining diagnostics on stderr.

Handlers produce structured results before rendering. They do not write
directly to process streams or derive machine data by parsing terminal text.

## Contract authority

Effect schemas own published wire shapes. The machine-output contract register
classifies every command path and tests compare it with the real command tree,
so a command cannot silently acquire or lose a machine contract.

Machine contracts evolve additively unless an explicit breaking decision says
otherwise. Human wording and layout may improve without changing the machine
schema. Exact fields, envelopes, and scenarios remain executable authority, not
prose maintained here.

## Interaction

Preview, confirmation, execution, and rendering refer to one operation
candidate. Machine mode never prompts. Cancellation, blocked work, partial
progress, rollback, and interruption remain distinct outcomes when the
underlying operation distinguishes them.

For closure-based operations, human and machine results identify each closure
as applied, no-op, blocked, failed, or rolled back. Overall nonzero exit status
means the complete request did not converge; it does not imply that no
independent closure committed.
