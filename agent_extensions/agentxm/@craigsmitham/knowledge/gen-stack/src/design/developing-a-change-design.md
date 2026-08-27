---
type: Guide
title: Developing a Change Design
description: Use when a change has materially ambiguous or consequential implementation choices; develop a proportional technical response and retain it in the conversation, a work item, or an explicitly governed durable document.
tags: [change-design, technical-design, specification, design-review, design-ideation, work-items, implementation-planning, agent-collaboration]
status: draft
sources:
  - id: change-design
    resource: change-design.md
    title: Change Design
  - id: requirement-impact
    resource: /control-loop/analyzing-requirement-impact.md
    title: Analyzing Requirement impact
  - id: preserving-context
    resource: /work-items/preserving-design-and-delivery-context.md
    title: Preserving design and delivery context in software work items
generated:
  by: codex/gpt-5.6
  at: 2026-08-26T20:07:37Z
---

# Developing a Change Design

> **Authority:** This Guide applies the canonical meaning in the [Gen Stack
> vocabulary and relationship model](/glossary.md). When it authors a
> profile-governed corpus concept, the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) owns its required
> representation. This Guide supports action and adds neither semantic authority
> nor profile-conformance rules.

Use this guide when an agent or human needs to reason through materially
ambiguous or consequential implementation choices before coding or capturing
the response in a work item. Produce only the detail needed to select,
communicate, implement, and verify the current change.

For the concept and its authority boundaries, read [Change
Design](change-design.md).

## Goal

Reach a proportional technical response whose inputs, choices, consequences,
maturity, unknowns, and verification approach are clear enough for the next
authorized action. Retain it only as durably as the work requires.

## Representation

Choose the least durable adequate native container before choosing headings. A
conversation uses lightweight prose; a tracker uses native fields plus its
body; an established RFC or design system uses its own schema. Present residual
meaning in this preferred order: scope and decision state, inputs and accepted
boundaries, selected response, affected responsibilities and interactions,
interfaces and state, failure handling, alternatives and tradeoffs,
consequences and risks, verification, then open questions. Omit inapplicable
material. Do not invent an ID, status, owner, timestamp, or lifecycle for a
transient design, and do not duplicate host fields in a persisted one.

## 1. Decide whether design work is needed

Start with the ambiguity or consequence, not a template. Explicit design work
is useful when the change involves one or more of:

- competing implementation approaches with material tradeoffs;
- a responsibility, dependency, interface, data, state, or failure boundary;
- concurrency, compatibility, migration, security, privacy, safety, or
  operational consequences;
- several Implementation Units or contributors;
- an architecture-significant decision or possible Requirement change; or
- reasoning another implementer or reviewer cannot safely recover from the
  eventual diff.

Proceed directly to implementation when the response is local, obvious,
reversible, already constrained by accepted Architecture, and leaves no
material rationale to preserve. Do not create design work merely to populate a
section.

## 2. Bind the inputs and authority

Identify the smallest applicable set:

- the Signal, observation, request, defect, or authorized change;
- accepted Requirement IDs and candidate Requirement impacts;
- affected Architecture responsibilities, boundaries, relationships, and
  ADRs;
- relevant current Implementation and evaluation evidence;
- binding constraints and explicitly labeled assumptions; and
- who or what may accept the response or any newly discovered obligation.

Treat code, tests, telemetry, and current behavior as evidence about what
exists, not automatic authority for what should exist. Apply [Analyzing
Requirement impact](/control-loop/analyzing-requirement-impact.md) when desired
state may change.

If those inputs reveal missing, underdeveloped, misplaced, disputed, or
contradicted Requirements, Surfaces, or C4 structure, use [Developing candidate
Architecture and
Requirements](/architecture/developing-candidate-architecture-and-requirements.md)
before designing around the gap. Record its evidence, impact, recommendation,
authority, and blocking status. A blocking gap stops only the response that
depends on unresolved meaning; a non-blocking gap remains visible while design
continues within accepted boundaries.

## 3. Frame the bounded design question

State:

- the outcome this technical response needs to enable;
- the affected subject and implementation boundary;
- what is deliberately out of scope;
- the material constraints and conservation obligations; and
- the decision that remains open.

Prefer a question such as “How should the reservation adapter preserve an
accepted request across a transient timeout?” over “Design the reservation
system.” The narrower question exposes the decision and discourages
speculative structure.

## 4. Explore only material alternatives

Develop the smallest set of plausible options that could change the decision.
For each, compare the forces that matter now: responsibility, coupling,
failure modes, consistency, compatibility, complexity, operability,
reversibility, and evidence cost.

Keep an option when its rejection explains the selected response or prevents
likely repetition. Do not enumerate imaginary technologies or future features
to make the discussion look complete.

## 5. Specify the selected response

Describe the response at the level needed to remove consequential ambiguity.
Use only the concerns that apply:

| Concern | Useful design question |
| --- | --- |
| Responsibilities | Which subject or Implementation Unit owns each decision, state transition, or policy? |
| Interactions | What calls, messages, events, or user actions cross a boundary, and in what order? |
| State and data | What is read, written, transformed, retained, or migrated? |
| Interfaces | Which contracts or compatibility surfaces change, and which remain conserved? |
| Failure and concurrency | What can fail or race, and how is safety, retry, idempotency, or recovery preserved? |
| Quality and operations | Which performance, security, privacy, safety, observability, rollout, or rollback concerns shape the response? |
| Verification | What observable conditions would distinguish correct realization, and how should evidence be gathered? |

Use prose first. Add diagrams, tables, pseudocode, schemas, interface examples,
or code sketches only when they communicate a boundary or rule more precisely.
Mark sketches as illustrative, proposed, or contractual.

## 6. Separate the response from adjacent work

Keep these distinctions visible:

- **Requirements** own binding outcomes and constraints.
- **Change Design** owns the selected bounded technical response and rationale.
- **Specifications** compose the representations needed for a bounded system
  or change without taking over their authority.
- **ADRs** own accepted architecture-significant choices that need an
  independent lifecycle.
- **Implementation plans and work items** own sequencing, assignment,
  dependencies, and delivery state.
- **Verification conditions** state what evidence would demonstrate the
  outcome; **testing strategy** states how to gather that evidence.

When a design discussion uncovers a candidate Requirement or Architecture
change or shows that an existing claim is misplaced, record the evidence,
impact, candidate options, recommendation, required authority, and blocking
status. Do not silently approve it by continuing into implementation.

## 7. State maturity, authority, and unknowns

Identify whether the material is:

- exploration or several options;
- a recommendation;
- a proposed response awaiting a named decision;
- an accepted response under the applicable authority;
- rejected; or
- superseded.

Keep assumptions and open questions visible. An agent recommendation is not
accepted merely because it is detailed, and beginning implementation does not
retroactively supply missing authority.

## 8. Choose the least durable adequate home

### Keep it in the conversation

Use conversation-only Design when implementation will follow immediately, the
change is bounded and reversible, no handoff or independent review is needed,
and the resulting code, tests, and review evidence will preserve everything
material.

Before leaving the conversation, restate the selected response, decisive
tradeoff, and verification approach so implementation does not depend on an
abandoned option from earlier discussion.

### Capture it in the work item

Use the work item when the work will outlive the conversation, be reviewed or
handed off, or needs traceability to Requirements and delivery. This is the
ordinary durable home.

The work item may also serve as a Change Specification or Bugfix Specification
when it composes the relevant source context, Requirements, Architecture,
Change Design, verification context, and delivery work. Keep those constituent
roles visible; the Specification label does not make every section normative
or accepted.

Adapt this block and omit unsupported sections:

```markdown
## Change Design

### Status and authority
- Maturity: exploring | recommended | proposed | accepted | superseded
- Decision authority or unresolved authority:

### Inputs and boundaries
- Applicable Requirements:
- Affected Architecture and ADRs:
- Constraints and assumptions:
- Goals and non-goals:

### Selected response
Responsibilities, interactions, state/data behavior, interfaces, and failure
handling at the level needed for this change.

### Alternatives and tradeoffs
Only material options and why they were not selected.

### Consequences and risks
Quality, security, compatibility, migration, operations, and reversibility as
applicable.

### Verification
Observable verification conditions and the proposed evidence strategy.

### Open questions
Unresolved decisions, owner or authority, and consequence of leaving each open.
```

Keep task sequence, assignees, and completion state in their established
work-item fields or delivery section rather than mixing them into the Design.
When the work item already contains design material, apply [Preserving design
and delivery context](/work-items/preserving-design-and-delivery-context.md)
before compressing it.

### Use a dedicated repository document exceptionally

Consider a standalone Change Design only when the reasoning spans several
work items, evolves independently, needs a separate review lifecycle, or
would otherwise be copied and diverge. Before creating it, require an
established repository convention for:

- canonical location and identity;
- ownership and review authority;
- proposal, acceptance, implementation, and supersession handling;
- links to Requirements, Architecture, work items, and evidence; and
- whether the document preserves change history or describes current state.

If that process does not yet exist, keep the Design in the conversation or
work item. Do not invent a permanent `change-design.md` convention ad hoc.

## 9. Carry the design through implementation

Implement against the selected response and applicable authorities. When new
evidence changes the response:

1. identify whether the Design, Requirement, Architecture, or Implementation
   assumption was wrong or incomplete;
2. obtain the authority needed for any desired-state or durable Architecture
   change;
3. update the work-item Design synopsis or explicitly supersede the affected
   choice; and
4. preserve why implementation diverged when the difference remains material.

At closure, distinguish Design conformance from Requirement satisfaction. A
realization can follow the Design and still fail a Requirement, or satisfy the
Requirement through a response that departed from the proposed Design.

## Final check

- The bounded design question and selected response are recognizable.
- Applicable Requirements and Architecture are linked rather than duplicated.
- Material alternatives, tradeoffs, consequences, and unknowns remain visible.
- Proposal, acceptance, implementation, and evidence states are not conflated.
- Detail is proportional to current ambiguity and consequence.
- The capture home is no more durable than the work requires.
- Any standalone document has an established owner and lifecycle rather than
  an invented convention.
- Material meaning gaps were routed to candidate Surface, C4 structure, or
  Requirement development and did not become hidden Design assumptions.
