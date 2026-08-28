---
type: Explanation
title: Change Design
description: How a bounded technical response realizes accepted Requirements and Architecture, including required Evaluation Protocols, without becoming another authority layer or requiring a standalone design document.
tags: [change-design, technical-design, design-doc, technical-specification, specification, work-items, implementation, architecture, requirements]
status: draft
sources:
  - id: kiro-requirements-first
    resource: https://kiro.dev/docs/specs/feature-specs/requirements-first/
    title: Kiro — Requirements-First workflow
  - id: kiro-design-first
    resource: https://kiro.dev/docs/specs/feature-specs/tech-design-first/
    title: Kiro — Design-First workflow
  - id: ieee-1016
    resource: https://standards.ieee.org/ieee/1016/4502/
    title: IEEE 1016-2009 — Software Design Descriptions
  - id: google-design-docs
    resource: https://abseil.io/resources/swe-book/html/ch10.html
    title: Google Software Engineering — Design Docs
  - id: nygard-adr
    resource: https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions
    title: Michael Nygard — Documenting Architecture Decisions
  - id: gen-stack-vocabulary
    resource: /glossary.md
    title: Gen Stack vocabulary and relationship model
generated:
  by: codex/gpt-5.6
  at: 2026-08-27T23:32:00Z
---

# Change Design

> **Authority:** The [Gen Stack vocabulary and relationship
> model](/glossary.md) is authoritative for canonical terms and relationships.
> This Explanation develops understanding without redefining them. When it
> discusses a profile-governed corpus representation, the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) governs that representation.
> This document adds neither semantic authority nor profile-conformance rules.

A **Change Design** is the bounded technical response formed while deciding
how to realize a software change within applicable Requirements and
Architecture. It preserves the reasoning needed to implement and verify the
response: material choices, responsibilities, interactions, interfaces,
state and data movement, failure behavior, tradeoffs, risks, and unresolved
questions.

For a coherent change, it also maps every accepted Architecture authority to
the technical elements that realize it and defines how each required
Requirement-satisfaction and Architecture-realization Evaluation Protocol will
produce executable evidence. That includes executable grouping, testability
seams, observability, data and environments, execution, failure and
inconclusive handling, and traceability. This technical realization does not
own or alter the Protocol's semantic claim.

The design is the response, not the document that happens to contain it. A
Change Design may exist only in an agent conversation, be captured inside a
work item, or exceptionally be maintained in a dedicated repository document.
Those containers affect durability and review; they do not change the
concept's meaning or confer authority.

Change Design is a Gen Stack method term, not a governed concept type in the
Gen Stack application profile. Instantiated system corpora do not need a
`design/` collection or a document for each change.

A Change Design is the how artifact associated with one
[Change](/work-items/changes.md). Its sibling Change Specification owns why
and what; the Change Design owns only the bounded technical response and
rationale.

For the practical workflow, see [Developing a Change
Design](developing-a-change-design.md).

## Why the concept is separate

Requirements and Design answer different questions:

- a **Requirement** states what an eligible Architecture subject is obligated
  to do, achieve, preserve, prevent, or constrain; and
- a **Change Design** explains the selected technical response for one bounded
  change.

Kiro makes this distinction concrete. Its requirements-first flow captures
stories, acceptance criteria, and EARS behavior before generating components,
sequences, data models, interfaces, technology choices, error handling, and a
testing strategy in `design.md`.[^kiro-requirements-first] Its design-first
flow reverses discovery order without erasing the semantic boundary: a design
can expose feasible candidate behavior, but the derived requirements still
receive their own review.[^kiro-design-first]

The ordering is therefore contingent. The authority boundary is not.

## Change Design is normally conversational

Designing is part of Orientation and Decision: inspect the current system,
consider alternatives and consequences, and select a response within the
applicable authority. That work does not need a standalone artifact merely
because it was deliberate.

Three common paths are legitimate:

| Path | Use when | What survives |
| --- | --- | --- |
| Conversation → implementation | The change is bounded, immediate, reversible, and needs no later handoff or independent review | The realized code, tests, review evidence, and any still-material rationale |
| Conversation → work item → implementation | Work persists beyond the conversation, needs review or handoff, or will be tracked separately | The complete Design when the work item is canonical; otherwise a proportional maturity synopsis, open questions, and an exact link to the canonical Design |
| Conversation → durable Change Design → work | The response spans work items, evolves independently, or contains reasoning that would otherwise be repeatedly rediscovered | One explicitly owned and maintained Design record plus linked work items |

The first two are ordinary. The third is exceptional and requires an
established repository location, owner, lifecycle, and relationship to current
Architecture. Do not create a durable design shelf in anticipation of that
future need.

When moving a landed Design into a work-item host, apply [Synchronizing change
artifacts with work-item hosts](/work-items/synchronizing-change-artifacts.md).
Synchronization preserves the exact Design or links its canonical home; it is
not another opportunity to condense or re-author it.

## Authority remains distributed

| Concern | Owner | Change Design's relationship |
| --- | --- | --- |
| Desired behavior or binding limitation | Requirement | Identifies and responds to the Requirement without restating it as a second authority |
| Durable subjects, responsibilities, boundaries, and relationships | Architecture | Maps accepted meaning to technical realization and returns any proposed semantic change to Change Specification |
| One accepted architecture-significant choice | Architecture Decision Record | May propose or apply the choice; the decision policy determines whether an ADR is required |
| Current code, configuration, schemas, and tests | Implementation | Proposes the response that Implementation may realize |
| Identity, classification, artifact revisions, coherence, and delivery state | Change | Supplies the technical response without taking over coordination |
| Semantic assessment claim and judgment | Evaluation Protocol | Realizes the accepted Protocol without changing its targets, criteria, coverage, or evidence expectations |
| Executable assessment mechanism | Evaluation realization | Selects Suites, Cases, seams, data, environments, harnesses, and evidence flow for required Protocols |
| Implementation-local conformance | Optional Implementation-conformance Evaluation | May define a local check, but returns durable or release-critical semantic obligations to Change Specification |

A Design may discover a missing or conflicting obligation. That is a
Requirement-impact finding, not permission to make the Design normative. It
may also reveal a durable Architecture change. Until the applicable authority
accepts that change, preserve it as proposed.

## Content is proportional to consequential ambiguity

The useful content is whatever another implementer or reviewer needs to
understand the response and its consequences. Common concerns include:

- the change boundary, goals, and non-goals;
- applicable Requirements, Architecture, decisions, and constraints;
- assumptions and observations about current Implementation;
- selected responsibilities, interactions, interfaces, state, data, and
  control flow;
- failure, concurrency, compatibility, security, privacy, operability, and
  migration behavior when material;
- alternatives and the tradeoffs that explain the selection;
- verification conditions and the proposed testing or evaluation strategy;
  and
- unresolved questions and the authority needed to decide them.

IEEE 1016 treats a software design description as a representation for
recording and communicating software design rather than prescribing one
method or medium.[^ieee-1016] Google's practice likewise emphasizes goals,
implementation strategy, key decisions, tradeoffs, alternatives, and review
of cross-cutting concerns.[^google-design-docs] Neither requires every small
change to fill an exhaustive template.

Detailed diagrams, pseudocode, schemas, API drafts, code sketches, rollout
steps, or test layers are useful only when they remove consequential ambiguity.
Their presence does not make an option accepted or an interface contractual.

## Maturity is independent of its container

A Change Design may contain exploration, several options, a recommendation, a
proposal, an accepted response, or a superseded response. Label that maturity
and the accepting authority explicitly when it matters. A polished work-item
section can remain only proposed; an informal conversation can contain an
accepted choice when the applicable authority makes it.

Delivery state is separate. Implementation beginning or finishing does not by
itself accept the Design, and an accepted Design is not evidence that its
response was realized correctly.

When one choice needs an independent durable lifecycle, extract or link an ADR
rather than making the whole Design an architecture decision. ADR practice
preserves one significant choice, its context, and consequences, including
supersession.[^nygard-adr]

## Names are not boundaries

Other practices use *design document*, *technical specification*, *RFC*,
*proposal*, and *software design description* for overlapping containers.
Some combine requirements, design, rollout, and implementation history. Gen
Stack classifies the claims inside either container rather than assigning one
generic Specification role:

- obligations remain Requirements;
- durable accepted system meaning remains Architecture or an ADR;
- bounded technical response is Change Design;
- coordination and execution state remain with the Change and its delivery records; and
- realized state and evidence remain with Implementation and Evaluations.

This claim-based treatment preserves interoperability without importing an
external document name as another semantic authority.

## Related

- [Developing a Change Design](developing-a-change-design.md)
- [Software architecture overview](/architecture/overview.md)
- [Requirements engineering](/architecture/requirements/requirements-engineering.md)
- [Analyzing Requirement impact](/control-loop/analyzing-requirement-impact.md)
- [Preserving technical context in software work items](/work-items/preserving-technical-context.md)

[^google-design-docs]: Google describes collaborative design documents as a
    pre-implementation review surface for goals, strategy, decisions,
    tradeoffs, alternatives, and cross-cutting concerns.
[^ieee-1016]: IEEE 1016-2009 defines the purpose and scope of Software Design
    Descriptions. The standard is inactive-reserved; this bundle does not claim
    conformance to its inaccessible normative clauses.
[^kiro-design-first]: Kiro's design-first workflow distinguishes high-level
    architecture from low-level pseudocode and interfaces, then derives and
    separately reviews requirements.
[^kiro-requirements-first]: Kiro's requirements-first workflow separates
    behavioral requirements, technical design, and executable tasks while
    permitting iteration among them.
[^nygard-adr]: Nygard limits an ADR to one architecture-significant decision
    and retains superseded records rather than rewriting their history.
