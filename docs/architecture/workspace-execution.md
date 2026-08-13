# Workspace execution

AXM reads a workspace through one coherent snapshot and changes it through one
mutation boundary. This keeps command handlers from developing incompatible
views of settings, resolutions, trust, packages, and agent outputs.

## Responsibilities

This document owns the structural relationship among workspace reads, plans,
mutations, transactions, and agent adapters.

## Non-responsibilities

This document does not define desired-state semantics, command behavior,
settings or lockfile fields, recovery scenarios, or transaction algorithms.
Those belong to design, schemas, tests, and code.

## Read boundary

Workspace consumers read settings, lockfile, trust, manifests, installed
packages, ownership evidence, and agent observations through the workspace read
model. One operation uses one snapshot; code does not mix cached and ad hoc
reads and then treat them as a coherent state.

Diagnostics may tolerate an invalid derived artifact in order to describe it,
but mutation planning retains enough information to distinguish missing,
invalid, and valid state.

## Mutation boundary

All production settings and lockfile changes pass through the workspace
mutation service. It serializes changes within a process and coordinates with
atomic file replacement and cross-process locking where required. Feature code
requests semantic changes rather than writing authoritative workspace files
directly.

An operation protects every affected local target before application. A
handled failure restores the affected unit; a stale plan writes nothing.

## Planning and adapters

Commands create one candidate from a workspace snapshot. Preview, rendering,
confirmation, structured output, and application refer to that same candidate
rather than rebuilding equivalent plans independently.

Agent adapters translate canonical extension state into agent-native outputs.
They own serialization mechanics, not workspace intent, resolution, or content
authority. The same ownership and collision policy applies across adapters even
when their file formats differ.

## Structural enforcement

Package boundaries, the workspace service API, transaction tests, and
end-to-end behavior enforce these relationships. This document preserves their
purpose without mirroring the current symbols that implement them.
---

status: stable
description: The shared read, plan, and mutation boundaries used by AXM workspace operations.
---
