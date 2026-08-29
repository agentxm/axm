---
type: Decision
status: stable
description: Executable specifications under `specifications/` are the sole local authority for accepted AXM requirements; documentation retains explanation without owning obligations.
depends-on:
  - ../system-wide/testing-strategy.md
---

# Executable specifications own AXM requirements

## Decision

Executable specification source under `specifications/` is the sole local
source of truth for every accepted AXM requirement — functional,
installability, compatibility, performance, security, usability, architecture,
process, and external-conformance. Specification execution supplies evidence;
it never changes the specification. Human review accepts specification
additions, revisions, and retirements as requirements decisions.

No Markdown document, decision record, issue, schema, report, ordinary test,
or implementation artifact owns or duplicates a local AXM requirement.
Documentation explains architecture, decisions, rationale, and procedures, and
links specification identities rather than restating normative expectations.
Externally owned standards and schemas remain authoritative for their own
definitions; a specification owns AXM's local adoption, applicability, and
deviations.

## Context

Before this decision, requirements authority was split among prose records,
architecture documentation, and behavior tests. The
[testing strategy](../system-wide/testing-strategy.md) defines the model this
decision ratifies. Maintainer acceptance of the specification corpus is the
authority for this record.

## Dispositions

Each retired authority class has one named destination:

| Former owner                      | Destination                                                                                           |
| --------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Normative statements in prose     | Executable specifications; prose keeps explanation and links specification identities                 |
| Architecture decisions            | `architecture/decisions/` records; each enforceable consequence is a specification                    |
| Package-oriented functional tests | Product-shaped specifications; remaining tests are classified internal, tooling, or boundary evidence |
| Execution results                 | CI, JUnit, Allure, and the generated specification catalog                                            |

## Consequences

- Changing a normative expectation is a specification change reviewed as a
  requirements decision, not routine test maintenance.
- Implementation-scoped work treats `specifications/` as read-only; a change
  touching both specifications and implementation is reviewed as a
  requirements change.
- A failing specification identifies disagreement between required and
  realized behavior; it never weakens the requirement.
- Completeness is judged against independent product inventories, never
  against the set of specifications that happen to exist.
- Requirements review walks the product-goal registry in
  `specifications/product-goals.ts`; a lapsed goal makes its specifications
  retirement candidates through the same reviewed diff that would add one.

## Reconsideration

Reconsider at public launch, when an external compatibility or support
commitment requires a differently governed requirements record, or when
specification review demonstrably fails to catch a consequential behavioral
regression that a separate requirements corpus would have caught.
