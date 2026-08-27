---
type: Guide
title: Developing candidate Architecture and Requirements
description: Use when greenfield intent or brownfield evidence suggests missing, underdeveloped, misplaced, or disputed architectural meaning; develop bounded candidate Surfaces, C4 structure, and Requirements without treating implementation as desired-state authority.
tags: [architecture-development, requirements-development, brownfield, greenfield, evidence, candidate-architecture, candidate-requirements, gap-analysis, subject-placement]
status: draft
sources:
  - id: gen-stack-overview
    resource: /overview.md
    title: How the Gen Stack operates
  - id: architecture-overview
    resource: overview.md
    title: Software architecture overview
  - id: requirements-engineering
    resource: requirements/requirements-engineering.md
    title: Requirements engineering in software architecture
generated:
  by: codex/gpt-5.6
  at: 2026-08-26T20:07:37Z
---

# Developing candidate Architecture and Requirements

> **Authority:** This Guide applies the canonical meaning in the [Gen Stack
> vocabulary and relationship model](/glossary.md). When it discusses a
> profile-governed corpus representation, the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) owns that representation.
> This Guide develops candidates and adds neither semantic authority nor
> profile-conformance rules.

Use this guide when a bounded change, defect, scenario, greenfield proposal, or
brownfield implementation suggests that architectural meaning is absent,
underdeveloped, attached to the wrong subject, or disputed. It supplies a
shared workflow; use only the element guides implicated by the evidence:

- [Developing Surfaces](surfaces/developing-surfaces.md) for actor-facing
  encounter points and interaction hierarchy;
- [Developing C4 structure](structure/developing-c4-structure.md) for software
  systems, runtime containers, components, and selected views; and
- [Developing Requirements](requirements/developing-requirements.md) for
  candidate obligations, sources, derivation, type, and subject placement.

When meaning and authority are already accepted, skip this workflow and use the
applicable `Documenting ...` guide to record the canonical concept directly.

## Goal

Produce the smallest evidence-linked candidate set needed for the current
decision or artifact. Keep candidate meaning, confidence, placement, authority,
and impact explicit so a person can accept, revise, reject, or defer it without
mistaking discovery for ratification.

## Representation

Use the current conversation, work item, review, or other native decision
surface; candidate development does not create an OKF concept. Present the
bounded result in this preferred order: question and next action, evidence and
authority, candidate meaning grouped by semantic class, conflicts and gaps,
options, recommendation, blocking status, and the human decision required.
Omit unused classes and do not invent canonical paths, identifiers, lifecycle,
frontmatter, or acceptance metadata. If accepted later, author each concept
through its native profile route rather than promoting the candidate container.

## 1. Bind the question and next action

State the bounded behavior, responsibility, boundary, or obligation under
review and the next action it must support. A defect report may need only a
visible expectation gap; a Bugfix Specification may need an accepted corrected
outcome before delivery; a greenfield design may need candidate interaction and
runtime boundaries before Requirements can be placed.

Do not inventory the whole repository or complete every architectural view.
Develop only what can change the current decision, scope, safety, implementation
approach, or verification claim.

## 2. Build an authority-aware evidence inventory

Record each material source with its provenance, observed claim, availability,
confidence, and authority. Useful brownfield evidence includes:

- accepted architecture, Requirements, decisions, contracts, and policies;
- user-visible routes, APIs, CLI commands, protocols, schemas, and compatibility
  commitments;
- deployment definitions, runtime processes, data stores, dependencies, and
  ownership boundaries;
- code responsibilities, tests, evaluation definitions and results, telemetry,
  incidents, runbooks, and change history; and
- repeated behavior that stakeholders rely on, including contradictory or
  unexplained behavior.

Useful greenfield evidence includes accepted or candidate Intent, scenarios,
external constraints, risks, prototypes, decision records, proposed operating
models, and evaluation design.

Implementation and observed behavior establish what exists or happened. They
may support an inference, expose a hidden contract, or contradict accepted
meaning, but they do not silently establish what ought to exist. When evidence
disagrees, preserve the disagreement and its possible owners instead of letting
the newest or most executable artifact win.

## 3. Classify the meaning gap

Use one or more of these diagnostic classifications:

| Gap | Diagnostic reading |
| --- | --- |
| Missing | Consequential meaning has no maintained owner. |
| Underdeveloped | An owner exists, but its boundary, responsibility, conditions, exclusions, or relationships cannot support the current decision. |
| Misplaced | Meaning is recorded on a subject or artifact that should not own it, or at an abstraction level that will not survive the relevant change. |
| Disputed | Material sources or authorities disagree about the subject, obligation, or response. |
| Stale or contradicted | Maintained meaning no longer matches evidence, without enough authority to decide which should change. |

A missing document is not automatically a Defect. Establish the applicable
expectation or intended use before using defect language. A gap may instead be
an open design question, undocumented candidate, maintenance risk, evidence
gap, or proposed change.

## 4. Develop the implicated elements together

Use the element guides independently but iterate across them:

```text
actor scenarios and intent
          ↓
candidate Surfaces ⇄ candidate Requirements ⇄ candidate C4 structure
          ↑                    ↓                       ↑
     interaction fit     subject and obligation   realization fit
```

A candidate Surface can reveal an actor-facing obligation that was wrongly
attached to a current Component. A candidate Requirement can expose a missing
Surface or structural responsibility. Candidate C4 structure can reveal that
one apparent obligation is actually several derived obligations on different
runtime owners. Preserve these as candidates until the applicable authority
accepts both the obligated subject and the obligation.

Do not create all three element kinds for symmetry. If the evidence implicates
only a Surface, use only the Surface guide. If direct accepted authoring is
possible, use no candidate-development ceremony.

## 5. Test placement with change and responsibility

Place meaning with the subject that actually bears it, not where a failure was
observed or code currently happens to implement it. Use these tests:

- **Encounter test:** Would the obligation remain if actors encountered the
  same behavior through a replacement implementation? If so, an actor-facing
  Surface, Feature, Capability, or System may be more appropriate than a C4
  Component.
- **Structural test:** Does the obligation intentionally bind one runtime or
  responsibility boundary even if actor-facing behavior is redistributed? If
  so, a C4 Software System, Container, or Component may be appropriate.
- **Replacement test:** If the candidate subject disappeared in a legitimate
  redesign, would the obligation still need to hold? If yes, the subject is
  probably too implementation-specific.
- **Scope test:** Does a narrower subject fully bear the obligation, or would
  choosing it omit actor paths, implementations, or conditions that must remain
  covered? Prefer the narrowest subject that is genuinely comprehensive.
- **Authority test:** Can the named subject own the responsibility, state,
  policy, or outcome needed to satisfy the obligation? Evidence location alone
  is not ownership.

When an accepted Requirement is already on the wrong subject, do not duplicate
it at the preferred location. Record a proposed reassignment and its impacts;
the applicable Requirement and Architecture authorities must accept the change.

## 6. Record a candidate and gap disposition

For each material candidate or gap, preserve the smallest useful set:

```text
Evidence and provenance:
Observed or proposed meaning:
Implicated element: Surface | C4 structure | Requirement | combination
Gap classification:
Candidate subject and rationale:
Candidate obligation or responsibility:
Alternatives and material tradeoffs:
Confidence and unknowns:
Applicable decision authority:
Impact on the current artifact or action:
Blocking status: blocking | non-blocking
Recommendation:
```

A gap is **blocking** only when unresolved meaning prevents the next action
from being truthful or safe—for example, no accepted expectation defines a
correction, subject placement changes the authorized solution, or an unresolved
boundary controls safety, compatibility, data ownership, or recovery. Stop
before the dependent mutation, while still completing any non-dependent intake
or analysis the user requested.

A gap is **non-blocking** when the current artifact can proceed honestly with
the uncertainty visible—for example, a Defect Report can preserve an
indeterminate expectation, or an authorized implementation-only change can
proceed while a missing evaluation route is separately recommended. Do not turn
every candidate into a review gate.

When a decision is required, present stable options, material tradeoffs, a
labeled recommendation, remaining uncertainty, and the applicable authority.
When no decision is needed for the authorized next action, report the gap and
continue.

## 7. Ratify and record separately

Candidate development ends with one of these outcomes:

- accepted by the applicable authority and ready for the relevant canonical
  `Documenting ...` guide;
- revised and still candidate;
- rejected with the reason preserved where useful;
- deferred with an owner or evidence need; or
- unresolved and blocking the named dependent action.

Acceptance of one element does not accept adjacent candidates. Recording a
Surface does not accept its candidate Requirements; accepting a Requirement
does not automatically accept a proposed C4 response. Preserve the decision
and then make the smallest canonical update that decision earned.

## Final check

- Evidence, inference, recommendation, and accepted meaning remain distinct.
- Only elements implicated by the bounded question were developed.
- Brownfield implementation was treated as realized-state evidence rather than
  automatic desired-state authority.
- Greenfield candidates are grounded in Intent, constraints, risks, scenarios,
  or decisions rather than invented for completeness.
- Requirement placement follows the load-bearing subject, not the failure or
  code location.
- Every material gap names its impact, authority, recommendation, and blocking
  status.
- Blocking gaps stop only dependent action; non-blocking gaps do not create a
  ritual pause.
- Canonical authoring begins only after explicit acceptance.
