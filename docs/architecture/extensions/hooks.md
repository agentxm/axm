---
status: stable
description: How AXM projects portable lifecycle Hooks into supported agent hook systems.
depends-on:
  - ./overview.md
  - ./targeting.md
  - ../workspace/instruction-files.md
---

# Hooks

A Hook is lifecycle automation that AXM realizes through a configured agent's
native hook system or an explicitly defined fallback.

## Responsibilities

AXM retains the canonical Hook content, determines whether each target can
represent its events and behavior, and writes only the owned native entries or
fallback projections required for activation. It exposes target capability
information so unsupported realization is understandable before mutation.

## Non-responsibilities

AXM does not execute hooks itself, guarantee that an agent will invoke them,
install undeclared runtimes, or weaken an unsupported Hook until it appears to
work. It does not own unrelated hooks or an entire native hook configuration.

## State and realization

The Hook's executable or instructional body is canonical extension content.
Native configuration and fallback instructions are derived outputs. A fallback
is valid only when the Hook declares behavior that the fallback can preserve;
otherwise the target is unsupported.

## Ownership and coexistence

The native ownership unit is one independently identifiable hook entry or
group. Other events, groups, and entries coexist, and their relative order and
content remain unchanged. Recognizing ownership from an executable path or
command text alone is insufficient.

If a native format cannot identify AXM's entry, preserve unrelated ordering, or
represent the Hook without merging ownership, reconciliation is unsupported.
Fallback instructions use one managed Hook region under the shared
[instruction-file](../workspace/instruction-files.md) ownership rules.

## Invariants

- Every realized entry is traceable to one desired Hook and AXM ownership.
- Unsupported events or capabilities are reported before partial projection.
- Fallback behavior is explicit and does not masquerade as native equivalence.
- Disabling a Hook removes owned activation without deleting canonical content.
- Unowned native hook entries and instruction content are preserved.

## Testing strategy

Behavior tests prove event and target capability checks, independent native
entries, same-entry collisions, ordering preservation, ownership provenance,
fallback-region boundaries, executable-content preservation, activation, safe
removal, rollback, and repeated reconciliation.
