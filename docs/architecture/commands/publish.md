---
status: stable
description: How AXM validates and distributes workspace-authored extensions.
depends-on:
  - ./overview.md
  - ../workspace/overview.md
---

# Publish

`axm publish` validates and distributes workspace-authored extensions. Its
fixed distribution contract is distinct from configurable local lint policy
and from workspace reconciliation.

## Responsibilities

Publish:

- selects explicitly requested authored extensions;
- validates the complete selection before starting immutable uploads;
- applies the registry's fixed archive and distribution requirements; and
- reports the outcome of each selected extension without overstating remote
  rollback.

An extension may be valid authored workspace content but ineligible for
distribution. For example, an empty authored pack is valid locally while the
publish gate rejects it.

## Non-responsibilities

Publish does not repair installed state, reconcile projections, change an
extension's local authority, treat local lint configuration as registry policy,
or infer publication intent from unpublished authored changes.

A configured workspace owner supplies an authoring default; it does not prove
the caller is authenticated or authorized to publish under that handle.

Remote registry effects are outside AXM's local rollback guarantee. Once an
immutable remote effect succeeds, a later local or remote failure cannot make
that effect unoccur.

## Testing strategy

Behavior tests prove complete-selection preflight, fixed-gate independence from
local lint policy, no upload before a failed preflight, truthful partial remote
outcomes, preservation of local authored content and workspace state, and
result parity between root and type-specific forms.
