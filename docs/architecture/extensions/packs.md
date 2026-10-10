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

AXM derives enabled Pack declarations into desired member origins, constraints,
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

An authored Pack manifest is workspace authority. A configured acquired Pack
uses its matching accepted dependency declaration, independently of installed
manifest availability or drift. An orphan lock row cannot create a desired
root. Realization consists of the desired dependency graph and
the ordinary canonical content and projections of its members.

Pack disablement is therefore not uninstall. It preserves the Pack as managed
state and removes only the dependency contribution associated with that Pack
while it is disabled. Explicit disable captures native selections before
suspending reachability. Exclusive acquired members become unreachable and are
retired when safe; remaining direct or enabled-Pack routes preserve their members.
A member package retained while native registrations referenced its code can be
retired by a later sync after those registrations have been explicitly withdrawn.

## Ownership and coexistence

Packs have no agent-native output and therefore no native coexistence category.
A workspace-authored Pack may exist as authoring inventory without being
desired. AXM preserves it until an explicit authoring operation removes it.

Registry, Git, and path Packs retain accepted dependency authority separately
from physical health. AXM removes proven-unreachable managed state, but
preserves and reports physical content whose ownership or integrity it cannot
establish. MCP and Hook member registrations follow
[native declaration authority](../workspace/managed-file-ownership.md#native-declaration-authority):
losing their last Pack route does not select them for cleanup, and retained
executable references can block canonical package deletion.
See [Pack retirement](../decisions/pack-retirement-when-the-package-cannot-be-read.md).

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
