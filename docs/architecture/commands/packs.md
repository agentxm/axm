---
status: stable
description: How pack commands edit authored dependency intent without becoming recovery commands.
depends-on:
  - ./overview.md
  - ../workspace/overview.md
  - ../workspace/invariants.md
---

# Packs

Pack commands manage authored bundle intent. A pack groups extension
dependencies without erasing their identities. [Pack architecture](../extensions/packs.md)
owns dependency, reachability, and realization semantics.

## Responsibilities

`packs add` is a narrow authored-manifest add-or-update operation. A dependency
is a fully qualified registry extension name with an explicit version
constraint. Supplying a new constraint explicitly authorizes replacing the old
declaration.

`packs remove` removes an authored dependency declaration. Both commands edit
authored intent only. Direct editing of an authored pack manifest remains a
supported equivalent way to express that intent.

Empty authored packs are valid workspace content. The publish gate separately
decides whether a pack is eligible for distribution.

## Non-responsibilities

Pack authoring commands do not define pack reachability, install, update,
reinstall, repair, or remove the dependency's realized workspace state merely
because they can reach its manifest. Lifecycle commands and sync own those
transitions.

Pack commands do not use replacement, empty-pack, or dependency-breaking flags
to bypass authored intent, reachability, accepted-lock, or publication
requirements.

## Testing strategy

Behavior tests prove add, explicit constraint update, remove, direct-edit
equivalence, empty local packs, and preservation of authored content after
failures. Pack architecture tests separately prove dependency authority,
reachability, and graph reconciliation.
