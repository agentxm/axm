---
type: Guide
title: Shaping a Pitch
description: Use when a raw or mixed change Signal needs enough bounded, repository-grounded intent to support specification or design; produce and refine a provisional Pitch without accepting desired state or selecting the technical response.
tags: [shape, pitch, change-intent, orientation, impact, breadboard, specification, design, authority]
status: draft
sources:
  - id: change-realization-process
    resource: ../processes/deciding-and-realizing-software-changes.md
    title: Deciding and realizing bounded software changes
  - id: shape-up-principles
    resource: https://basecamp.com/shapeup/1.1-chapter-02
    title: Shape Up — Principles of Shaping
  - id: shape-up-elements
    resource: https://basecamp.com/shapeup/1.3-chapter-04
    title: Shape Up — Find the Elements
generated:
  by: codex/gpt-5.6
  at: 2026-08-27T21:30:00Z
---

# Shaping a Pitch

> **Authority:** This Guide applies the canonical meaning in the [Gen Stack
> vocabulary and relationship model](../glossary.md) and the recommended
> Process in [Deciding and realizing bounded software
> changes](../processes/deciding-and-realizing-software-changes.md). It adds no
> semantic, mutation, priority, funding, or release authority.

Use shaping before specification or design when a Signal, request, proposal,
issue, opportunity, or body of evidence does not yet express a sufficiently
bounded change. Shaping turns that context into a **Pitch**: a rough,
grounded, discussable articulation of what change may be worth defining and
which parts of the system it is likely to affect.

This adaptation uses the appetite, boundary, risk, and breadboarding ideas from
Shape Up while preserving Gen Stack authority and stage boundaries. The Pitch
frames a question that specification and design can answer. It does not solve
that question in advance.

## Outcome

A satisfactory Pitch is:

- **purposeful** — the problem or opportunity and intended outcome are clear;
- **bounded** — appetite, scope edges, and no-gos prevent uncontrolled growth;
- **grounded** — claims distinguish supplied context, repository evidence,
  inference, and unresolved assumptions;
- **answerable** — `spec`, `design`, research, investigation, or a named human
  decision has a concrete next question;
- **rough** — response contours expose the likely shape without prematurely
  choosing detailed Requirements, Architecture, Design, or implementation;
- **impact-aware** — affected Gen Stack elements and their repository
  realization are visible; and
- **evaluation-agnostic** — anticipated Requirement-satisfaction and
  Architecture-realization Protocol meaning is visible without prescribing
  implementation-level Evaluations, tests, or their realization;
- **authority-aware** — every proposed meaning change remains provisional until
  its proper authority accepts it.

The Pitch may remain conversational or be stored in an authorized native host.
Its container does not turn it into accepted Intent, a Requirement,
Architecture, a Change, a Change Specification, a Change Design, a Work item, or an
implementation commitment.

## Choose how much to elicit

Select the lightest behavior that can produce a truthful Pitch:

| Condition | Behavior |
| --- | --- |
| The context establishes the problem, outcome, boundary, and affected area with manageable uncertainty | Produce a Pitch immediately and invite refinement |
| A useful frame is possible but a few material facts are uncertain | Produce a clearly provisional Pitch, then ask only the questions that could materially change it |
| Ambiguity, disagreement, consequence, irreversibility, authority, or evidence gaps make an early frame anchoring or unsafe | Elicit or discover the discriminating information first, then pitch |
| The question is primarily external or distributed evidence | Route a bounded question to research, then resume shaping |
| The question is a concrete observed condition or discrepancy | Route a bounded diagnostic question to investigation, then resume shaping |
| The proposal is unauthorized, not worth pursuing, superseded, or does not require change | Dispose it as blocked, deferred, or no change instead of manufacturing a Pitch |

Scale discovery with consequence, not with document length. Favor immediate
shaping for local, reversible, well-evidenced changes. Increase elicitation for
changes near public contracts, durable data, security or privacy boundaries,
cross-system responsibilities, costly migration, weak recovery, contested
Intent, or unknown decision authority.

Ask one compact set of questions at a time. Prefer questions that separate
materially different Pitches: who experiences the problem, what outcome would
be different, what must remain unchanged, what appetite applies, what evidence
supports the concern, and who decides the affected meaning. Do not require the
requester to restate facts that repository evidence can safely establish.

## Shape the change

1. **Bind the source and authority.** Identify the initiating records,
   observations, proposals, current decision, meaning maturity, and available
   read or mutation authority. Preserve disagreement and uncertainty.
2. **Frame the problem or opportunity.** State the consequential current
   condition without treating the requester's preferred mechanism as the
   problem definition.
3. **State the intended outcome.** Describe what should become observably
   better for whom. Avoid task completion, a named technology, or deployment as
   the outcome unless that is itself the authorized concern.
4. **Set appetite and boundaries.** Record the acceptable investment or
   proportionality, material inclusions, exclusions, no-gos, invariants, and
   stopping conditions. Appetite is a constraint on shaping, not an estimate,
   deadline, priority, or delivery promise.
5. **Orient across the stack.** Compare the candidate change with applicable
   System and governance, Intent, Requirements, Architecture, Evaluations,
   Implementation, operations, Process, and Provenance. Distinguish an
   anticipated semantic change from a realization-only effect or evidence gap.
   For Evaluations, stop at anticipated Requirement-satisfaction and
   Architecture-realization Protocol identity, claim, lifecycle, and semantic
   coverage. Do not shape implementation-conformance Evaluations or test
   realization.
6. **Breadboard repository impact.** Inspect enough of the actual filesystem
   and established corpus to show the likely touched elements, their current
   topology, and their material relationships. Do not enumerate the whole
   repository.
7. **Sketch response contours.** Name the smallest plausible responsibilities,
   interactions, or change seams that make the request answerable. Treat all
   unaccepted response ideas as hypotheses for `design`, not selected Design.
8. **Expose risks and rabbit holes.** Name uncertainties, interactions, or
   attractive expansions likely to change the Pitch or consume its appetite.
   Route evidence gaps proportionately.
9. **Request a response.** State exactly what `spec`, `design`, a human
   authority, research, or investigation should establish next.

## Filesystem breadboard

Place the breadboard directly after the Impact summary without adding a
`Filesystem breadboard` heading. Use a bounded plain-text tree or graph that
shows current relevant topology plus the candidate impact overlay. Collapse
unaffected directories and include exact repository-relative paths and
existing concept identifiers when known.

Use these markers consistently:

```text
[=] relevant and expected to remain semantically unchanged
[P] provisional semantic impact requiring its owning authority
[~] likely realization, representation, or evidence change
[+?] possible new element; identity and placement unresolved
[!] material uncertainty, conflict, or missing evidence
```

Prefer exact established relationship labels such as `has subject`, `realizes`,
`evaluates`, and `contains` where a relationship is material. Candidate nodes
and links must remain visibly provisional. Never invent a path, identifier,
relationship, or absent corpus. When filesystem access is unavailable, say so
in the breadboard and identify the inspection still needed.

The breadboard is not a file-change plan. It shows the affected semantic and
realization neighborhood so downstream work can decide the actual delta.

Keep implementation-level Evaluation and test artifacts out of candidate
impact. Existing tests, suites, fixtures, harnesses, and results may be
consulted as evidence about current state and named in Provenance, but must not
appear as `[P]`, `[~]`, or `[+?]` breadboard changes. Shape must not propose a
test type, test file, suite, fixture, harness, framework, command, code-coverage
target, or Implementation-conformance Evaluation. Those choices belong to
Design, and executable sequencing belongs to planning or implementation.

## Pitch presentation contract

Use the following headings in order. Include only applicable subsections under
Impact, but never omit the Impact summary or breadboard.

```markdown
# Pitch: <bounded change title>

## Problem or opportunity
<The consequential current condition and evidence that make change worth considering.>

## Intended outcome
<The observable improvement, affected audience, and why it matters.>

## Appetite
<The acceptable investment and proportionality constraints, without estimates or commitments.>

## Boundaries and no-gos
<Material scope edges, invariants, exclusions, and approaches that should not be pursued.>

## Impact
<A concise summary of the likely cross-stack and realization impact.>

<Filesystem breadboard, with no additional heading.>

### System and governance
<Anticipated effects on the System boundary, lifecycle, ownership, decision policy, assurance, or other cross-cutting governance.>

### Intent
<Anticipated changes to human-oriented direction and their current maturity.>

#### Offerings
<Offerings whose value or boundary may change.>

#### Audiences
<Audiences whose outcomes, roles, or exposure may change.>

#### Needs
<Needs newly addressed, changed, or called into question.>

#### Jobs to Be Done
<Jobs and circumstances whose desired progress may change.>

#### Value Propositions
<Value claims that may be introduced, revised, or invalidated.>

#### Use Cases
<Goal-oriented interactions whose intent may change.>

#### Subdomains
<Problem-space distinctions whose meaning or ownership may change.>

### Requirements
<Applicable obligations, candidate desired-state changes, gaps, and unchanged constraints.>

### Architecture
<Anticipated durable responsibility, boundary, interaction, or decision impact.>

#### Architecture Decisions
<Existing decisions constrained or candidate decisions likely required.>

#### Capabilities
<Capabilities whose responsibility or outcome may change.>

#### Features
<Feature-level behavior likely affected.>

#### Surfaces
<Actor-visible interfaces, operations, or interaction points likely affected.>

#### Domains and Bounded Contexts
<Domain ownership, language, model, or integration boundaries likely affected.>

#### C4 Structure
<People, software systems, containers, or components likely affected.>

#### C4 Views
<Views that may need to expose the changed structure or interaction.>

### Evaluations
<Anticipated semantic impact on Requirement-satisfaction and Architecture-realization assessment obligations, without prescribing their technical realization.>

#### Protocols
<Named or provisionally identified Requirement-satisfaction or Architecture-realization Protocol claims and lifecycle changes that specification may need to determine.>

#### Coverage and evidence
<Semantic coverage conditions or evidence gaps that could affect the Pitch; omit test types, files, suites, fixtures, harnesses, tools, commands, code coverage, and Implementation-conformance Evaluations.>

### Implementation
<Likely realization impact without prescribing the implementation plan.>

#### Units
<Existing or possible product Implementation Units in the affected realization neighborhood, excluding Evaluation and test artifacts.>

### Operations, Process, and Provenance
<Operational behavior, recurring work, migration, ownership, lifecycle records, or traceability likely affected.>

## Rough response contours
<Plausible responsibilities, interactions, or seams that bound the response without selecting Design.>

## Risks and rabbit holes
<Uncertainty, consequence, coupling, and tempting expansions that could invalidate or overrun the Pitch.>

## Authority and maturity
<What is observed, inferred, proposed, or accepted; who owns material decisions; and what action is authorized.>

## Requested response
<The exact next question for spec, design, research, investigation, or a human authority.>

**Disposition:** Draft | Ready for response | Blocked | Deferred | No change
```

Do not emit empty Impact subsections merely to satisfy the template. One
sentence may cover a low-impact subsection; consequential cross-stack change
may require more. Keep detail proportional to the decision the Pitch enables.

## Readiness and disposition

Use **Ready for response** only when the Pitch has a recognizable problem or
opportunity, intended outcome, appetite or explicit appetite gap, boundaries,
grounded impact, material unknowns, authority state, and a precise requested
response. A ready Pitch may still contain non-blocking uncertainty.

Use **Draft** when discussion can productively refine a provisional frame. Use
**Blocked** when a named fact, authority, or evidence gap prevents a responsible
Pitch or downstream response. Use **Deferred** when the change is intentionally
set aside with its reason and reopening condition. Use **No change** when the
evidence supports disposition without a change; do not force a specification
or design handoff.

Ordinary handoffs are:

- `spec` to determine the formal desired-state and coordination delta;
- `design` to compare and select the proportional technical response;
- a human authority to decide contested Intent, Requirement, Architecture,
  appetite, boundary, priority, or authorization;
- research or investigation to resolve a bounded evidence gap; or
- termination with the Pitch's disposition.

`spec` determines actual Requirement and Architecture change. `design`
determines the technical response. The Pitch identifies anticipated impact and
response contours so those stages can begin coherently; it does not pre-decide
their outcomes.

## Final check

- The Pitch separates the concern from any supplied solution.
- The problem, outcome, appetite, boundaries, and requested response agree.
- Impact covers the relevant Gen Stack elements, not a ritual inventory.
- The breadboard uses inspected paths and identifiers, with provisional impact
  and unknowns visibly marked.
- Evaluation impact stays at Requirement-satisfaction and
  Architecture-realization Protocol meaning; no test or
  Implementation-conformance realization is prescribed.
- Proposed meaning, response contours, and accepted decisions remain distinct.
- Risks that could materially change the Pitch are exposed or routed.
- The disposition and next route are supported without implying acceptance,
  priority, implementation, or release authority.
