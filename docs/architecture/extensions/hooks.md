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

Hooks realize through two aggregate ownership units, both under the shared
[output reconciliation contract](../workspace/overview.md#output-reconciliation).

The native unit is the set of AXM-owned entries in one configured agent's hook
configuration. Its contributor set is every active Hook the desired state
reaches that realizes natively for that agent. Unrelated events, groups, and
entries coexist, and their relative order and content remain unchanged. Each
owned entry stays traceable to its one Hook, but no entry is written in
isolation: every write renders the whole set. Recognizing ownership from an
executable path or command text alone is insufficient.

The Hook fallback region is the shared-instruction-surface unit. Its
contributor set is every active Hook the desired state reaches that realizes
through the fallback. It is written under the shared
[instruction-file](../workspace/instruction-files.md) ownership rules.

If a native format cannot identify AXM's entries, preserve unrelated ordering,
or represent the Hook without merging ownership, reconciliation is unsupported.

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
removal, rollback, and repeated reconciliation. The shared
[multi-route contributor coverage](overview.md#testing-strategy) applies to
both the native unit and the fallback region.
