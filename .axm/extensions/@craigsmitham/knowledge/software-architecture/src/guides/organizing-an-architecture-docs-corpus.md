---
type: Guide
title: Organizing an architecture docs corpus
description: How to grow a concise, navigable architecture docs corpus while giving every admitted concept a stable named identity from its first appearance.
tags: [architecture-documentation, architecture-docs, organization, stable-identity, navigation, progressive-disclosure, human-comprehension, product-quality]
status: draft
sources:
  - id: just-enough-architecture-docs
    resource: ../architecture-documentation/just-enough-architecture-docs.md
    title: Just Enough Architecture Docs
  - id: software-architecture-docs-profile
    resource: ../architecture-documentation/software-architecture-application-profile.md
    title: Software architecture docs application profile for OKF v0.2
generated: { by: codex/gpt-5.6, at: 2026-08-21T23:53:22Z }
---

# Organizing an architecture docs corpus

## Goal

Create one progressively disclosed architecture docs corpus in which every
maintained concept has a stable canonical home and readers can quickly reach
the architecture question they need to answer.

## Before you begin

Identify the system or authority boundary, the repository's established docs
root, and the accepted content that passes the [Just Enough Architecture Docs
admission test](../architecture-documentation/just-enough-architecture-docs.md#apply-the-admission-test).[^just-enough-architecture-docs]
Use `docs/architecture/` when the repository has no stronger convention. Do
not create empty collections to anticipate future content.

## Steps

1. Create or revise the architecture root `index.md`. Name the documented
   system or authority and link every maintained top-level view.
2. Add a collection when its first concept or view is admitted. Use the
   canonical collection name immediately unless repository authority already
   establishes a clearer route.
3. Give each collection a navigational `index.md`; keep substantive meaning in
   descriptive concept files. Use short selection cues in index entries, not
   comparison matrices or boundary rationale.
4. Give every maintained concept a named canonical file from its first
   appearance. Never use a plural catch-all such as `use-cases.md` or
   `features.md` to hold several peer concepts that will later require a split.
5. When several concepts are repeatedly confused, give their comparative
   relationship one boundary document while each concept retains its positive
   definition. Express many-to-many relationships with meaningful prose links
   instead of duplicate files or invented folder containment.
6. Apply the [software architecture docs application
   profile](../architecture-documentation/software-architecture-application-profile.md)
   when the corpus adopts OKF. Its paths and containment rules are normative
   for governed concepts.[^software-architecture-docs-profile]
7. Add, move, or merge one subject at a time. Update the relevant indexes and
   inbound links in the same change.

## Grow without changing concept identity

These examples are stages, not completeness targets.

### Minimum adoption

When no substantive architecture concept has yet passed the admission test,
the root may be the whole corpus:

```text
docs/architecture/
└── index.md
```

The root identifies the documented system or authority, adoption and local
authority routes, existing admitted subjects, and maintenance triggers. It is
not a substitute for a substantive overview.

### First admitted concept

The first maintained use case earns both its collection and its stable named
file:

```text
docs/architecture/
├── index.md
└── use-cases/
    ├── index.md
    └── confirm-reservation.md
```

Do not begin with `use-cases.md` and move its contents later. A second use case
adds another named sibling without changing the first concept's identity.

### Growing corpus

A growing corpus adds only views that answer current reader questions:

```text
docs/architecture/
├── index.md
├── overview.md
├── use-cases/
│   ├── index.md
│   └── confirm-reservation.md
├── quality/
│   ├── index.md
│   └── reliability/
│       ├── index.md
│       └── recoverability/
│           ├── index.md
│           └── resume-interrupted-imports.md
├── domains/
│   ├── index.md
│   ├── core/
│   │   ├── index.md
│   │   └── reservation-management.md
│   └── contexts/
│       ├── index.md
│       └── reservations.md
└── structure/
    ├── index.md
    ├── containers/
    │   ├── index.md
    │   └── reservation-service.md
    └── views/
        ├── index.md
        └── containers.md
```

This example does not imply that value, capabilities, features, surfaces,
strategy, other product quality requirements, components, dynamics, or
deployment views are missing.
They simply have not earned a maintained route in this corpus.

## Collection ownership

The following paths are a placement menu, not a template. A path appears only
when it contains admitted content.

| Path | Owns |
| --- | --- |
| `index.md` | Navigation from the documented system to each maintained view |
| `overview.md` | System boundary, purpose, responsibilities, exclusions, lifecycle and stewardship route, and major relationships |
| `strategy/` | Strategic position, evolution, inertia, and accepted architecture consequences |
| `value/` | Offerings, audiences, needs, jobs, and value propositions |
| `use-cases/` | Goal-oriented behavior of named subjects for contextual actors |
| `capabilities/` | Stable abilities of a declared organization, system, or subsystem |
| `features/` | Independently recognizable behavior meaningful across one or more use cases, surfaces, or realizations |
| `surfaces/` | Actor-facing encounter points for system behavior |
| `quality/<characteristic>/<subcharacteristic>/` | Named, architecture-significant Product Quality Requirements under one primary ISO/IEC 25010:2023 classification |
| `domains/generic/` | Necessary problem knowledge normally obtained rather than differentiated |
| `domains/core/` | Differentiating problem knowledge on which distinctive value depends |
| `domains/supporting/` | Necessary domain-specific knowledge that enables the core |
| `domains/contexts/` | Bounded models, languages, authorities, exclusions, and relationships |
| `domains/context-maps/` | Directional relationships and obligations among bounded contexts |
| `structure/systems/` | Canonical C4 software-system elements |
| `structure/containers/` | Canonical C4 applications and data stores |
| `structure/containers/<container>/components/` | Significant components owned by exactly one container |
| `structure/views/` | Selected C4 structural, dynamic, deployment, and code views |

Within `value/`, keep its five demand-and-value concept collections as
siblings. Keep `use-cases/` separate as the behavioral bridge to capabilities,
features, surfaces, domain authority, and C4 structure. Within `domains/`,
classify only subdomains as `generic`, `core`, or `supporting`; bounded contexts
and context maps remain sibling collections. Within `structure/`, preserve C4
containment and keep views separate from the canonical elements they show.

Within `quality/`, let the first named Product Quality Requirement earn its
primary characteristic and subcharacteristic route. Keep every index
navigational, link additional classifications rather than duplicating the
requirement, and keep cross-requirement priorities and tradeoffs in the system
overview. Do not add Product Quality View or Quality Concern documents to make
the taxonomy appear complete.

When a concept gains cohesive subordinate documents, retain its canonical
`<concept>.md` and add a same-named adjacent directory. For example,
`domains/contexts/reservations.md` remains the Bounded Context concept while
`domains/contexts/reservations/` groups elaboration of that same subject.

Subordinate documents are not a way to hide several peer entities under one
original concept. If the content names independently addressable concepts,
give each one its own canonical file from the start.

## Optimize the reading path

Keep the common path short: root index, overview when needed, then one named
concept or selected view. Lead with purpose, responsibility, boundary,
lifecycle or stewardship exceptions, and the implications a maintainer needs.
Move precision to its authoritative evidence instead of copying it.

Use a small diagram or table when it makes several relationships, a hierarchy,
or a sequence easier to scan. Generate views of current repository structure,
dependencies, schemas, or deployments when practical; manually maintain only
the durable interpretation that generation cannot supply. Remove a visual when
its maintenance cost exceeds the comprehension it provides.

## Concept comparisons

Indexes help a reader choose a route; they do not own architecture semantics.
When a one-sentence index description no longer resolves recurring confusion,
create a substantive concept-boundary document for the smallest cohesive
comparison set.

- Each concept document owns its positive definition, evidence, and detailed
  treatment.
- The boundary document owns how the concepts differ, overlap, and guide
  selection.
- Individual concepts may retain a short nearest-neighbor distinction and link
  to the comparative authority.
- Use a compact reference when lookup is primary and an explanation when the
  rationale or many-to-many relationships matter.
- Do not add a special OKF type or relationship field unless an actual consumer
  requires it.

For this corpus model, `value/` concepts form one demand-and-value comparison
set. Goal-oriented behavior owns the Audience–Actor–Use Case–Feature–User Story
distinctions that repeatedly cross that boundary. Capability, surface, DDD,
C4, Wardley, and Product Quality Requirement concepts retain their own positive
models and compare only consequential neighbors. DDD owns the subdomain–bounded-context
distinction, and C4 owns its structural containment hierarchy; neither belongs
in a universal architecture matrix.

## Example root index

Keep the root index navigational. Replace the paths below with Markdown links
in a real corpus and omit routes that have no admitted content.

```markdown
# Reservation platform architecture

Accepted, durable meaning for the reservation platform. Begin with the system
overview, then choose the architecture question relevant to your change.

- System overview — `overview.md` — Purpose, boundary, responsibilities,
  exclusions, lifecycle, stewardship, and major relationships.
- Use cases — `use-cases/` — Goal-oriented subject behavior for contextual
  actors.
- Product quality requirements — `quality/` — Named, accepted quality outcomes
  whose consequences materially constrain the architecture.
- Domains — `domains/` — Classified subdomains, bounded contexts, context maps,
  language, authority, and invariants.
- Structure — `structure/` — Selected C4 structure, dynamics, and deployment.
```

## Final check

- Every present collection contains admitted content and earns a browsing
  decision.
- Every concept is reachable from the architecture root, has one canonical
  named file from first admission, and is not embedded in a plural inventory.
- Value, goal-oriented behavior, Product Quality Requirements, capability,
  feature, surface, DDD, C4, and strategy remain distinct but explicitly
  related.
- Subdomain classification and C4 containment match their governing models.
- Indexes navigate; concept files own substantive meaning.
- Current repository facts are linked or generated; prose owns their durable
  interpretation rather than a copied inventory.
- System lifecycle, maintenance responsibility, decision authority, and review
  triggers are discoverable without duplicating volatile rosters.
- Recurring comparisons have one boundary authority while each concept retains
  its positive definition.
- Repository-specific deviations are explicit and preserve reader discovery.

## Related

- [Just Enough Architecture Docs](../architecture-documentation/just-enough-architecture-docs.md)
- [Software architecture docs application profile for OKF v0.2](../architecture-documentation/software-architecture-application-profile.md)
- [Architecture guides](index.md)

[^just-enough-architecture-docs]: Just Enough Architecture Docs defines which
    durable claims warrant a maintained place in the corpus.
[^software-architecture-docs-profile]: The application profile makes the
    governed concept types, paths, metadata, and containment rules normative
    for adopting OKF corpora.
