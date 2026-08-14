---
status: stable
description: How AXM composes enabled Rule extensions into a managed instruction region.
depends-on:
  - ./overview.md
  - ../workspace/instruction-files.md
---

# Rules

A Rule is reusable behavior guidance composed into a workspace's managed
instruction surface. The Rule extension lifecycle is distinct from the
workspace's decision to manage canonical instruction files and aliases.

## Responsibilities

AXM retains canonical Rule content and composes enabled Rules deterministically
into the owned Rule region. It keeps Rule activation separate from the
workspace's decision to enable instruction-file management.

The Rules command group owns only Rule-specific lifecycle and authoring work.
The root `axm instructions` command family manages the workspace capability,
and [Instruction files](../workspace/instruction-files.md) owns the shared
surface's behavior.

## Non-responsibilities

AXM does not turn every instruction into a Rule extension, decide whether the
guidance is correct, or act as a general policy engine. Enabling instruction
management does not implicitly enable every Rule, and enabling a Rule does not
grant authority over the surrounding instruction file.

## State and realization

Canonical Rule content owns the reusable guidance. The ordered Rule region in
the canonical instruction source is a derived workspace output. Canonical file
selection, aliases, and other contributed regions belong to the shared
instruction-file capability.

## Ownership and coexistence

AXM owns the aggregate Rule region, not the surrounding instruction file. User
prose and other independently marked regions coexist outside it. Shared marker,
alias, collision, and disablement behavior follows the instruction-file
contract. Removing the last active Rule removes the owned Rule region, never
the remaining authored content or unrelated contribution regions.

## Invariants

- Rule composition is deterministic and does not duplicate contributions.
- Activation and global instruction management remain separate choices.
- Disabled rules retain canonical content but contribute no active guidance.
- Rule removal never affects unrelated instruction contributors.

## Testing strategy

Behavior tests prove deterministic composition, ordering, activation,
instruction-management interaction, surrounding prose and contribution
preservation, formatter changes, safe removal, and idempotent reconciliation.
Shared instruction-file tests own marker and alias behavior.
