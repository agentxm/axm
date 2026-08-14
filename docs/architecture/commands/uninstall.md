---
status: stable
description: How AXM removes direct extension intent while preserving other desired routes.
depends-on:
  - ./overview.md
  - ../workspace/overview.md
  - ../workspace/invariants.md
---

# Uninstall

`axm uninstall` removes the selected extension's direct route from workspace
configuration. Desired-state reachability, not installation history, decides
which content remains afterward.

## Responsibilities

Uninstall recomputes the affected desired state and removes lock entries,
AXM-managed canonical extension content, and AXM-owned projections only when no
desired route retains them. If a Pack still reaches the selected extension,
AXM keeps it and reports that result truthfully.

Cleanup that depends on the complete dependency graph waits until AXM can
derive that graph safely. The configuration and managed state that do change
are applied as one affected operation.

## Non-responsibilities

Uninstall does not break remaining Pack-derived routes, delete
workspace-authored or unowned content, repair unrelated state, or use an
override to make an otherwise desired extension unreachable.

## Testing strategy

Behavior tests cover direct-only, pack-retained, multiply reachable, incomplete
graph, and unowned-collision cases. They prove the exact permitted removal,
atomic failure, idempotence, and parity between root and type-specific forms.
