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

Before this decision, requirements authority was split: a separately installed
Gen Stack corpus owned canonical Requirements, selected actor-facing
Architecture, and Evaluation Protocols, while detailed architecture prose and
behavior tests carried substantial exact design and scenario authority of
their own. The [testing strategy](../system-wide/testing-strategy.md) defines
the target model and the
[testing strategy migration](../system-wide/testing-strategy-migration.md)
defines the transition this decision ratifies. Maintainer direction to execute
that migration is the accepting authority for this record.

## Dispositions

Each retired authority class has one named destination:

| Former owner                               | Destination                                                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Gen Stack Requirements                     | Executable specifications under `specifications/`, selected by requirement class                                         |
| Gen Stack Evaluation Protocols             | Specification definitions and their runners                                                                              |
| Gen Stack Architecture Decision Records    | `architecture/decisions/` records; each enforceable consequence is a specification                                       |
| Gen Stack Surfaces                         | Non-normative command and workspace architecture explanations that already exist in this bundle                          |
| Gen Stack System governance kernel         | The narrowest non-normative explanation: system boundary and assurance context live in this bundle and `CONTRIBUTING.md` |
| Normative statements in architecture prose | Executable specifications; prose keeps explanation and links specification identities                                    |
| Package-oriented functional tests          | Product-shaped specifications; remaining tests are classified internal, tooling, or boundary evidence                    |
| Execution results                          | CI, JUnit, Allure, and the generated specification catalog                                                               |

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
- Requirements review walks the intent registry in
  `specifications/intents.ts`; a lapsed intent retires its specifications
  through the same reviewed diff that would add one.

## Reconsideration

Reconsider at public launch, when an external compatibility or support
commitment requires a differently governed requirements record, or when
specification review demonstrably fails to catch a consequential behavioral
regression that a separate requirements corpus would have caught.
