---
type: Guide
title: Organizing an architecture docs corpus
description: How to organize a concise subject-first OKF architecture corpus with stable concepts and requirements colocated beneath their architecture subjects.
tags: [architecture-documentation, organization, okf, requirements, progressive-disclosure]
status: draft
sources:
  - id: software-architecture-docs-profile
    resource: ../architecture-documentation/software-architecture-application-profile.md
    title: Software architecture docs application profile for OKF v0.2
  - id: just-enough-architecture-docs
    resource: ../architecture-documentation/just-enough-architecture-docs.md
    title: Just Enough Architecture Docs
generated:
  by: codex/gpt-5.6
  at: 2026-08-25T19:19:59Z
---

# Organizing an architecture docs corpus

Organize for the reader's subject, not for the implementation repository, test
runner, or a universal product hierarchy. Architecture concepts identify the
things a reader reasons about. Requirements sit beside the subject they
obligate. Other views connect through meaningful links.

## Begin with the required kernel

```text
index.md
system.md
lifecycle.md
ownership.md
decisions.md
assurance.md
```

The root index declares OKF v0.2, explicitly adopts the current profile, and
links all five concepts. Each root concept owns distinct accepted meaning; do
not use an overview or C4 system as a substitute.

## Add subjects only when earned

Use the canonical collections for demand and value, use cases, capabilities,
features, surfaces, domain concepts, C4 elements, views, and ADRs. Give each
independently addressable concept a named file from first admission and create
only the indexes its collection needs.

Do not create empty directory taxonomies or plural catch-all concept files.
Use same-named adjacent directories only when they elaborate a canonical
subject. Surface concepts may recurse when narrower encounter points deserve
their own identity, such as:

```text
surfaces/
├── index.md
├── cli.md
└── cli/
    ├── index.md
    ├── install.md
    └── install/
        ├── index.md
        └── requirements/
```

The surface tree communicates the product's interaction model. It does not
dictate unit, integration, property, or end-to-end suite structure.

## Colocate requirements

For the first accepted obligation of a subject, add:

```text
<subject>.md
<subject>/
├── index.md
└── requirements/
    ├── index.md
    └── <requirement_type>/
        ├── index.md
        └── <requirement>.md
```

The six allowed type folders are `functional`, `quality`, `process`,
`human-factors`, `usability`, and `constraint`. Create only folders containing
requirements. `subject` makes the path relationship explicit, and
`requirement_type` must match the folder.

The eligible subject types are System, Offering, Capability, Feature, Surface,
Bounded Context, and C4 Software System, Container, or Component. Use cases,
needs, policies, and decisions normally source or shape requirements rather
than own them.

This is semantic ownership, not only physical placement. Extract an accepted,
independently maintained invariant, guarantee, prohibition, boundary rule,
required failure or recovery outcome, binding dependency direction, or system
process obligation into one Requirement. Replace a former binding formulation
in architecture prose with a link and explanation of the subject or
architecture response. Source concepts may retain their motivating scenario,
need, policy, risk, or decision without becoming a second normative authority.

## Preserve independent views

Do not physically nest every concept beneath an Offering or product. Value,
behavior, abilities, interaction surfaces, domain authority, C4 realization,
requirements, and evidence answer different questions. Link them with explicit
relationship language and let generated projections assemble reader-specific
views.

In particular:

- `decisions.md` is the required decision policy; `decisions/` contains named
  accepted ADRs only when present;
- Subdomains, Bounded Contexts, and Context Maps remain sibling DDD views;
- C4 Components remain under exactly one owning Container;
- requirements live with subjects, not in top-level `quality/` or
  `constraints/` taxonomies; and
- tests and evaluations reference `requirement_id` but remain with their
  executable authority.

## Maintain navigation

Every present collection has an `index.md` that states its grouping rule and
links immediate concepts or child collections. Every maintained concept is
reachable from the root. A path move changes OKF identity; update inbound
links, evidence references, generated consumers, and `log.md` together.

## Final check

- The five root concepts exist and contain accepted meaning.
- Every maintained subject has one canonical named file.
- Requirements use one stable ID, valid type, eligible explicit subject,
  matching colocated path, singular `shall` statement, and rationale.
- Author-authored binding `shall` statements appear only in Requirement
  concepts, and no admitted obligation remains load-bearing architecture prose.
- No empty collection, plural catch-all, top-level `quality/`, or top-level
  `constraints/` remains.
- Architecture, requirements, implementation, and evidence have distinct
  authorities and traceable links.
- The corpus remains a concise semantic delta rather than a prose inventory.
