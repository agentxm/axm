---
type: Architecture
status: stable
description: How Packs expand dependency intent while preserving member identity, authority, and reachability.
depends-on:
  - ./overview.md
  - ../workspace/overview.md
  - ../workspace/invariants.md
---

# Packs

A Pack is a dependency container. It makes a curated set of leaf extensions
desired without copying them, hiding their identities, or creating a shared
runtime directory. Pack activation controls whether that dependency route
contributes to desired state.

## Responsibilities

AXM resolves an enabled Pack manifest into desired member origins, constraints,
and inherited activation. It combines direct and Pack-derived reachability,
retains members still required through another origin, and realizes one Pack
graph as a single affected unit. Disabling the Pack retains its configuration,
resolution, and canonical content while suspending that route's contribution.

The Packs command group may edit authored membership and unpack members into
direct workspace intent. Those capabilities operate on the same dependency
and reachability model used by install, update, uninstall, and sync.

## Non-responsibilities

Packs do not copy member content, erase member ownership, create a shared
filesystem container, define a general dependency system between extensions,
or depend on other Packs. Pack dependencies do not introduce arbitrary external
sources.
Recommendations alone do not create desired state or guarantee co-installation.

A Pack has no runtime or agent-native projection to activate. Its activation
controls dependency reachability only; it does not directly toggle member
content that remains reachable through another desired route.

## State and realization

An authored Pack manifest is workspace authority. A Registry Pack's accepted
locked manifest identity owns its published dependency meaning; a divergent
installed copy cannot redefine that graph. Lock-only member metadata cannot
create reachability. Realization consists of the desired dependency graph and
the ordinary canonical content and projections of its members.

Pack disablement is therefore not uninstall. It preserves the Pack as managed
state and removes only the dependency contribution associated with that Pack
while it is disabled.

## Ownership and coexistence

Packs have no agent-native output and therefore no native coexistence category.
A workspace-authored Pack may exist as authoring inventory without being
desired. AXM preserves it until an explicit authoring operation removes it.

A Registry Pack is managed installed state only while its manifest and accepted
lock identity establish that authority. AXM removes unreachable managed state when
the desired graph is complete, but preserves and reports content whose
authority it cannot establish. Non-registry external Pack sources remain
unsupported.

## Invariants

- Every member retains its full identity, source, constraint, authority, and
  independent origins.
- Pack graphs are one level deep and contain only leaf extensions.
- Registry Pack dependencies name registry extension identities and
  constraints, not external source locators.
- Removing or disabling one origin retains members still reachable elsewhere.
- A Pack graph changes transactionally; partial member success is not success.
- Direct activation intent takes precedence over activation inherited from a
  Pack.

## Testing strategy

Behavior tests prove authored inventory outside desired state, registry
manifest authority, dependency resolution, direct and shared reachability,
activation precedence, orphan retention, graph transactions, safe managed
cleanup, ambiguous-content preservation, unpacking, external-source rejection,
local divergence, unrelated invalid-state isolation, and idempotent
reconciliation.
