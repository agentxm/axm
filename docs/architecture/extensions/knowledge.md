---
type: Architecture
status: stable
description: How AXM manages isolated knowledge bundles and makes their concepts discoverable on demand.
depends-on:
  - ./overview.md
  - ../workspace/instruction-files.md
  - ../workspace/managed-file-ownership.md
---

# Knowledge

A Knowledge extension is an isolated Open Knowledge Format bundle that agents
and users discover and read on demand without injecting the corpus into routine
instructions.

## Responsibilities

AXM validates the supported knowledge profile, retains the canonical bundle,
indexes its concepts, and publishes a compact discovery entry when the bundle
is active and workspace instruction management permits it. The Knowledge
command group may provide concept resolution, search, reading, and
bundle-specific validation.

Knowledge installation, activation, and on-demand discovery remain useful when
instruction publication is disabled. The compact entry is one optional
contribution to the shared instruction surface, not the authority for the
bundle or its index.

An author may set the bundle manifest's `instructionEntry` default, and a
workspace may override it on that bundle's direct settings entry. Omission at
both layers admits the entry. The workspace choice wins over the manifest,
while disabled instruction-file management, disabled Knowledge instruction
publication, and disabled bundle activation remain outer gates. None of these
entry-publication choices changes the enabled bundle's indexing, search, or
concept reading.

## Non-responsibilities

AXM does not inject full concept content into agent instructions, decide which
claims are true, rewrite authored prose, dereference every external source, or
make knowledge discovery a general document search engine. Installing a bundle
does not force every task to load it.

## State and realization

The bundle under canonical extension content is authoritative. Search indexes,
concept graphs, and the compact instruction entry are derived and
rebuildable. The discovery entry routes readers to the bundle; it is not a
second copy of its knowledge.

## Ownership and coexistence

AXM owns the managed discovery region, not unrelated workspace documents or
the surrounding instruction file. Authored prose and other independently marked
regions coexist outside the discovery region. An absent region may be created
when instruction management authorizes it. A one-sided, duplicate, or malformed
marker sequence makes ownership ambiguous and blocks reconciliation. Search
indexes and concept graphs are derived, rebuildable working state, not native
ownership units.

The discovery region is an aggregate ownership unit under the shared
[output reconciliation contract](../workspace/overview.md#output-reconciliation).
Its contributor set is every active bundle the desired state reaches whose
manifest default and optional workspace override effectively admit it, whether
reached directly or through a Pack. Every write renders that whole set, so one
bundle's lifecycle never drops another bundle's discovery routing.

A Pack-only bundle follows its manifest default. A direct settings declaration
for the same bundle may override that default. The declaration is durable
desired intent rather than a Pack-member overlay: it contributes its source
constraint and remains after the Pack route is removed.

A workspace-authored Knowledge bundle may exist without being desired or
discoverable; it remains authoring inventory. Removing activation strips only
owned discovery state. Removing an externally acquired bundle requires both
lost reachability and evidence that AXM owns the installed canonical content.

## Invariants

- Every discoverable concept belongs to one identifiable bundle revision.
- The bundle remains navigable from its own index without workspace injection.
- Disabling a bundle removes active discovery while retaining canonical state.
- Discovery output contains routing context, not the bundle's substantive
  content.
- Instruction-surface enablement, Knowledge activation, and publication of the
  compact Knowledge entry remain distinct choices.
- Workspace entry policy overrides authored manifest policy without changing
  either bundle identity or concept availability.

## Testing strategy

Behavior tests prove bundle validation, authored inventory outside desired
state, graph and index reproducibility, concept identity, query and read
revision consistency, surrounding instruction preservation, ambiguous region
boundaries, compact discovery, activation, safe stale-state removal,
instruction-management interaction, and idempotent rebuilding.

The compact discovery unit is `region=knowledge` with provenance owner
`@agentxm/knowledge/discovery`; `knowledge-base` is not a region identifier.
Its markers and ambiguity behavior follow the shared
[ownership grammar](../workspace/managed-file-ownership.md).
