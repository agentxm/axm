---
type: Explanation
title: Change specifications
description: How bounded Change Specifications compose source context, authority, Requirements, Architecture, Change Design, verification, and implementation coordination without taking over their meanings or lifecycles.
tags: [change-specification, specification, system-change, architecture-change, requirements, change-design, implementation, traceability, work-item]
status: draft
sources:
  - id: gen-stack-vocabulary
    resource: ../glossary.md
    title: Gen Stack vocabulary and relationship model
  - id: change-design
    resource: ../design/change-design.md
    title: Change Design
  - id: requirement-impact
    resource: ../control-loop/analyzing-requirement-impact.md
    title: Analyzing Requirement impact
  - id: iso-29148
    resource: https://www.iso.org/standard/72089.html
    title: ISO — ISO/IEC/IEEE 29148:2018 Requirements engineering
generated:
  by: codex/gpt-5.6
  at: 2026-08-26T20:14:40Z
---

# Change specifications

> **Authority:** The [Gen Stack vocabulary and relationship
> model](/glossary.md) is authoritative for canonical terms and relationships.
> This Explanation develops understanding without redefining them. When it
> discusses a profile-governed corpus representation, the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) governs that representation.
> This document adds neither semantic authority nor profile-conformance rules.

A **Change Specification** is a bounded composition used to shape, coordinate,
and assess a proposed or authorized change to the System or its Architecture.
It can connect source context and Intent, applicable or candidate Requirements,
affected Architecture, Change Design, verification context, and implementation
coordination without becoming the authority for all of them.

The word **change** makes the scope broad enough for behavior, quality,
constraint, data, dependency, migration, removal, and structural Architecture
work. The word **Specification** means that those representations have been
assembled around one bounded change. It does not mean every included proposal
is accepted or that delivery is authorized.

## Exactly four work-item roles

The Gen Stack software work-item taxonomy contains exactly four first-class
roles and no others:

| Work item | Begins when | Primary responsibility |
| --- | --- | --- |
| Operational Incident Record | Current or imminent service impact meets the local threshold for coordinated response | Impact, response, service state, recovery, communication, and follow-up |
| Defect Report | An Observation, received concern, or static finding may indicate a Defect | Signal, source, expectation, evidence, diagnostic activity, classification, disposition, and Provenance |
| Change Specification | A candidate or selected system or Architecture change is bounded well enough to compose and evaluate | Change context, authority state, Requirements and Architecture impact, Change Design, verification, and implementation coordination |
| Bugfix Specification | Investigation has identified a Bug and an authorized decision has selected corrective change | Corrective scope, linked Defect Reports, unchanged expectations, regression context, verification, and implementation coordination |

A Bugfix Specification is a specialized Change Specification, but it remains a
distinct work-item type because it has additional preconditions and must retain
the provenance of the Bug and its Defect Reports. Neither an Incident Record
nor a Defect Report matures into a Specification by being retitled.

Investigation is uncertainty-reduction activity during Orientation or within
one of these four roles; it is not a work-item type or separately prescribed
artifact. Tasks, stories, epics, and similar planning records may exist under
host workflows, but they are host-native mechanics outside the Gen Stack
taxonomy.

## A request is input, not automatically a Specification

A request, idea, anomaly, environmental change, or Evaluation Result may be a
Signal. A source request proves that someone expressed a desire in a particular
context; it does not prove the underlying need, select a response, accept a
Requirement, or authorize delivery.

Keep the source occurrence in its authoritative intake or feedback system when
one exists. A Change Specification may link it and include a safe, faithful
synopsis, but it must not rewrite the requester's words as though they were the
accepted change.

Create a Change Specification only when a candidate change has a recognizable
boundary: the affected system or Architecture context, intended change outcome,
material exclusions, and current decision state can be stated without
inventing them. If the only known fact is an unbounded desire, preserve the
Signal and continue Orientation with a bounded investigation activity instead.

This boundary does not require authorization before a Specification can exist.
A proposed Change Specification can support a decision, provided it labels its
Requirements, Architecture, Design, and delivery authority honestly. Opening a
polished work item does not turn a proposal into accepted desired state.

## Authority remains distributed

Each constituent answers a different question:

| Constituent | What it owns | What inclusion does not establish |
| --- | --- | --- |
| Signal or source record | What drew attention and its originating context | That a change is needed or selected |
| Intent | Desired outcomes and why they matter | A binding obligation or technical response |
| Requirement | One accepted obligation assigned to one eligible Architecture subject | Its implementation or satisfaction |
| Architecture and ADRs | Durable subjects, responsibilities, boundaries, relationships, and accepted significant choices | Delivery state |
| Change Design | The bounded technical response, rationale, tradeoffs, risks, and unresolved questions | Acceptance of a new Requirement or Architecture change |
| Change Specification | Composition and navigation for the bounded change | Common authority over its constituents |
| Evaluation | Assessment method, execution, observations, and evidence | Acceptance or revision of desired state |

The Change Specification may quote or summarize enough context for coherent
delivery, but stable authorities should be linked rather than copied into a
second normative statement. Its status describes the change case, not the
acceptance state of every constituent.

## Change state and authority are separate

A host may use states such as proposed, authorized, designed, in delivery,
implemented, verified, deferred, or superseded. Those states are useful only
when their meaning and transition authority are locally defined.

At minimum, a Change Specification should expose:

- the current decision and who or what had authority to make it;
- which Requirements and Architecture are accepted, proposed, disputed, or
  unknown;
- whether a Change Design is exploring, recommended, proposed, accepted, or
  superseded;
- whether implementation is planned, underway, completed, or rolled back; and
- whether verification evidence is planned, available, failed, or unknown.

These dimensions can move independently. Implementation may begin before a
candidate Requirement is accepted, but that does not make the Requirement
authoritative. An accepted Design may not yet be implemented. A merged change
may remain unverified.

## The lifecycle is a network

```text
Signal, Observation, source request, or environmental change
                              │
                              ▼
                     Orientation and Decision
                     ┌────────┼─────────┐
                     │        │         │
                  decline  investigate  bound a candidate change
                                         │
                                         ▼
                               Change Specification
                          context, authority, impact,
                          Design, verification, delivery
                                         │
                          one-to-many and many-to-one
                                         ▼
                         Implementation activity
                                         │
                                         ▼
                         Implementation and Evaluation evidence
                                         │
                              informs later Orientation
```

Several Signals can motivate one Change Specification. One broad change can
produce several Specifications with independent delivery or rollback. One
Specification can coordinate several host-native tasks, and one accepted Requirement or
Architecture subject can constrain many Specifications. Preserve those links
instead of forcing ticket conversion or one-to-one hierarchy.

## Change scope is broader than functionality

A Change Specification can center on:

- new or changed behavior;
- a quality outcome such as performance, reliability, security, or usability;
- a binding constraint or compatibility boundary;
- a data or schema migration;
- a dependency, platform, or deployment change;
- a change to a Bounded Context, C4 responsibility, or interaction boundary;
- removal, replacement, or deprecation; or
- correction of a Requirement, Architecture representation, Evaluation, test,
  or document when no concrete system Bug has been identified.

The change should be classified by its actual affected authorities and outcome,
not by a tracker label or the implementation files expected to change.

## Tracker labels do not settle meaning

Issue trackers use labels such as feature, enhancement, story, epic, task,
idea, proposal, or project at different levels of maturity and hierarchy.
These are host-native planning mechanics, not Gen Stack work-item roles. The
host label determines workflow mechanics; it does not determine whether the
item contains a bounded change, an accepted Requirement, an Architecture
decision, or delivery authority.

Portable guidance therefore names the semantic work item while preserving the
host's identifiers, fields, status transitions, and relationships. A tracker
item may serve as the Change Specification container without changing the
meaning or canonical owner of anything it references.

Use [Managing work-item metadata and
labels](managing-work-item-metadata-and-labels.md) to project that meaning into
host fields, and [Maintaining work-item identity, relationships, and
lifecycle](maintaining-work-item-identity-relationships-and-lifecycle.md) to
manage the Specification and its related host-native planning records without forcing a
ticket-conversion pipeline.

## Choosing another artifact

Use another artifact when:

- current or imminent service impact requires coordinated response — create an
  [Operational Incident Record](operational-incident-records.md);
- an observed discrepancy may violate an accepted expectation — create a
  [Defect Report](failures-defects-and-defect-reports.md);
- investigation has identified a Bug and correction is authorized — create a
  [Bugfix Specification](bugs-and-bugfix-specifications.md);
- only uncertainty reduction is authorized — continue Orientation or conduct a
  bounded investigation within the existing case;
- a request remains too unbounded to name a candidate change — retain it as a
  Signal or source record; or
- the change is already decomposed and only execution remains — use the host's
  native planning mechanics and link the governing Specification; those
  records remain outside the Gen Stack taxonomy.

For the authoring procedure and adaptable template, see
[Writing change specifications](writing-change-specifications.md).
For source and authority handling shared with every substantive work item, see
[Preserving evidence and authority in software work
items](preserving-work-item-evidence-and-authority.md).
