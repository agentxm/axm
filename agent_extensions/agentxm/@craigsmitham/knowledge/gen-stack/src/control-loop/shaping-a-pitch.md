---
type: Guide
title: Shaping a Pitch
description: Use when a raw or mixed change Signal needs enough bounded, repository-grounded intent to support specification or design; produce and persist a provisional Pitch without accepting desired state or selecting the response.
tags: [shape, pitch, change-intent, orientation, impact, specification, design, artifact-lifecycle, open-items]
status: draft
sources:
  - id: change-realization-process
    resource: ../processes/deciding-and-realizing-software-changes.md
    title: Deciding and realizing bounded software changes
  - id: shape-up-principles
    resource: https://basecamp.com/shapeup/1.1-chapter-02
    title: Shape Up — Principles of Shaping
generated:
  by: codex/gpt-5.6
  at: 2026-08-28T20:00:00Z
---

# Shaping a Pitch

> **Authority:** This Guide adds no semantic, mutation, priority, funding, or
> release authority.

Use this Guide after [Running a change-realization
stage](../processes/running-change-realization-stages.md) when a Signal,
request, proposal, issue, opportunity, or body of evidence does not yet express
a bounded change.

## Outcome

A useful Pitch is purposeful, bounded, grounded, rough, impact-aware,
evaluation-agnostic, authority-aware, and answerable by a named next consumer.
It separates the concern from a supplied solution and never turns anticipated
impact into accepted Intent, Requirement, Architecture, Design, or commitment.

The first coherent Pitch is immediately persisted as `Draft` in the canonical
Change target. Ordinary discussion may refine it without writes. It becomes
`Ready` only when the exact persisted artifact has no Open items and can be
accepted by `$spec`.

## Choose how much to elicit

| Condition | Behavior |
| --- | --- |
| Problem, outcome, boundary, and affected area are sufficiently clear | Produce the first Draft immediately |
| A few material facts are uncertain | Draft honestly, then ask only discriminating questions |
| Consequence, irreversibility, disagreement, or authority gaps make framing unsafe | Elicit or discover the minimum evidence first |
| The question is external or distributed evidence | Route a bounded research question |
| The question is an observed discrepancy | Route a bounded investigation |
| Evidence supports deferment or no change | Terminate with that stage disposition; do not manufacture a Pitch |

Scale discovery with consequence, not document length.

## Shape the change

1. **Bind source, target, and authority.** Identify initiating evidence,
   current decisions, the canonical Change target, permissions, and decision
   roles.
2. **Frame the problem or opportunity.** State the consequential current
   condition without adopting the requester's mechanism as the problem.
3. **State the intended outcome.** Describe the observable improvement and
   affected audience without prescribing implementation.
4. **Set appetite and boundaries.** Record proportional investment, scope,
   no-gos, invariants, and stopping conditions. Appetite is not an estimate,
   deadline, priority, or promise.
5. **Orient across the stack.** Identify only material anticipated effects on
   Intent, Requirements, Architecture, Evaluations, Implementation,
   operations, Process, and Provenance.
6. **Sketch topology when it helps.** Use a bounded filesystem tree or graph
   only when relationships or placement materially clarify impact. Use exact
   inspected paths and identifiers; never invent them. This is not a mandatory
   breadboard or file plan.
7. **Sketch response contours.** Name plausible responsibilities,
   interactions, or seams without selecting Design.
8. **Expose blockers and risk.** Put next-acceptance blockers in Open items;
   keep non-blocking uncertainty and rabbit holes in Risks.
9. **Name the next response.** State the exact question for `$spec`, `$design`,
   research, investigation, or a human authority.

For Evaluations, stop at anticipated Requirement-satisfaction and
Architecture-realization Protocol meaning. Existing tests may be evidence, but
do not propose test types, files, Suites, fixtures, harnesses, commands,
coverage targets, or Implementation-conformance Evaluations.

## Portable form

Use semantically matching native fields where available. Otherwise use:

```markdown
# Pitch: <bounded change>

> **Artifact:** <stable Pitch identity and exact revision>
> **State:** `<Draft | Ready | Accepted>`
> **Canonical:** <work item, native field set, body region, or exact link>

## Summary

<Current condition, material evidence, affected audience, and observable
improvement.>

## Open items

- **OI-1 — <blocker>**
  - **Authority:** <responsible role>
  - **Resolves when:** <observable condition>

## Appetite and boundaries

- **Appetite:** <proportional investment>
- **In scope:** <included behavior, actors, or surfaces>
- **Out of scope:** <explicit exclusions>
- **Must preserve:** <material invariants>
- **No-gos:** <unacceptable response boundaries>

## Material impact

<Only material Intent, Requirement, Architecture, Evaluation, Implementation,
operations, Process, and Provenance effects. Include a bounded filesystem or
relationship sketch only when it clarifies topology.>

## Response contours

<Plausible responsibilities, interactions, or seams; none is selected Design.>

## Risks and authority

<Material uncertainty, rabbit holes, decision roles, and current authority.>
```

Omit Response contours when no material contour is useful. For `Ready` or
`Accepted`, write `- None.` under Open items. Put a consequential human decision
in Open items; keep the eligible next action in the shared handoff rather than
duplicating it in the Pitch.

## Readiness and termination

A Pitch is `Ready` only when problem, outcome, appetite, boundaries, grounded
impact, material risk, and authority are sufficient for
Specification and authoritative readback verifies the exact artifact.

`$spec` accepts that exact persisted Ready Pitch before producing dependent
work. Acceptance approves the framing, not the anticipated semantic or
technical response.

Deferment and no-change are stage dispositions, not extra artifact states. A
blocked framing remains `Draft` with the blocker in Open items.

## Final check

- The Pitch separates the concern from any supplied solution.
- Detail is proportional; no ritual impact inventory or mandatory breadboard
  remains.
- Proposed meaning and response contours remain provisional.
- Open items agree with `Draft`, `Ready`, or `Accepted`.
- The first coherent Draft and each state change follow the common persistence
  contract.
- No next stage, priority, implementation, or release authority is implied.
