---
type: Guide
title: Writing bugfix specifications
description: Use when investigation has identified a Bug and an authorized corrective change needs a separate implementation-coordinating Specification; link its Defect reports, bound the correction, develop the Change Design, and define verification without losing Provenance.
tags: [bugfix, bugfix-specification, corrective-change, bug, defect-report, change-design, requirements-impact, verification, delivery, work-item-template]
status: draft
sources:
  - id: bugfix-explainer
    resource: bugs-and-bugfix-specifications.md
    title: Bugs and bugfix specifications
  - id: change-specification-guide
    resource: writing-change-specifications.md
    title: Writing change specifications
  - id: change-design-guide
    resource: ../design/developing-a-change-design.md
    title: Developing a Change Design
  - id: requirement-impact
    resource: ../control-loop/analyzing-requirement-impact.md
    title: Analyzing Requirement impact
  - id: requirement-change-guide
    resource: specifying-requirement-changes.md
    title: Specifying Requirement changes
  - id: preserving-context
    resource: preserving-technical-context.md
    title: Preserving technical context in software work items
generated:
  by: codex/gpt-5.6
  at: 2026-08-26T22:30:00Z
---

# Writing bugfix specifications

> **Authority:** This Guide applies the canonical meaning in the [Gen Stack
> vocabulary and relationship model](/glossary.md). When it authors a
> profile-governed corpus concept, the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) owns its required
> representation. This Guide supports action and adds neither semantic authority
> nor profile-conformance rules.

Use this guide when investigation has identified concrete defective behavior
or a defective condition in the realized system and an authorized decision has
selected corrective change. Create a Bugfix Specification as a separate work
item or other explicit Specification container; never retitle the originating
Defect report.

For the conceptual boundary and relationship cardinalities, read
[Bugs and bugfix specifications](bugs-and-bugfix-specifications.md). If the
observation or cause is still uncertain, continue with
[Recording defect reports](recording-defect-reports.md) or a bounded
investigation activity instead.

A Bugfix Specification specializes a [Change
Specification](writing-change-specifications.md). Apply the general source,
authority, Requirements, Architecture, Change Design, verification,
implementation-coordination, and relationship guidance here, then add the Bug-specific provenance,
corrective-decision, unchanged-expectation, and regression requirements below.

## Goal

Implementers and reviewers can recover which Bugs anchor the correction, which
related Defects are established or still suspected, which evidence and
authority justify each change, which Requirements and Architecture constrain
it, how the response is designed and delivered, and what evidence will verify
it—without turning the Bugfix into a second Defect report or rewriting the
originating Signal.

## Representation

Use exact native tracker fields for identity, type, workflow state, priority,
assignment, and relationships when their semantics match. Present residual
body content in this preferred order: summary, identified Bugs and linked
Defect Provenance, corrective decision, expected and corrected behavior,
Requirement and Architecture impact, scope and constraints, Change Design,
verification, then delivery and recovery. The [tracker-ready
template](#tracker-ready-template) is a logical fallback; omit inapplicable
sections and do not duplicate native fields, Defect evidence, or canonical
Requirements.

## Apply the common work-item guides

This guide owns the Bug-specific corrective composition. Use [Preserving
evidence and authority in software work
items](preserving-work-item-evidence-and-authority.md) for Defect-report
provenance and corrective authority, [Maintaining work-item identity,
relationships, and
lifecycle](maintaining-work-item-identity-relationships-and-lifecycle.md) for
separate identities and transitions, [Managing work-item metadata and
labels](managing-work-item-metadata-and-labels.md) for host fields and external
mutation, and [Titling and summarizing work
items](titling-and-summarizing-work-items.md) for the derived brief.

## Preconditions

- At least one linked Defect report preserves the originating Signal,
  evidence, and investigation.
- Investigation has identified a concrete Bug rather than only a suspected
  discrepancy or an unlocalized Failure.
- The applicable authority has selected corrective change rather than only
  further investigation activity, deferment, compensation, or accepted risk.
- Restricted evidence remains in an approved location and can be referenced
  safely.

## 1. Create a separate Bugfix identity

Apply the shared identity guide. Create a new work item or other explicit
Specification container. Link every
material Defect report and preserve the host's relationship to incidents,
occurrences, regressions, and related Bugs.

Do not copy the reports wholesale. Include a concise synopsis sufficient to
orient the corrective work, then point to the reports for source evidence,
chronology, reporter context, and investigation history. Never close, retitle,
or replace a report merely because the Bugfix exists.

## 2. State the identified Bug

Describe the smallest concrete defective behavior or system condition that the
investigation established:

> Invoice export excludes zero-value lines when tax detail is present because
> the export filter treats zero as absent.

Name the affected behavior, triggering conditions, and established scope.
Distinguish confirmed findings from remaining hypotheses. Link the evidence
and diagnosis in the Defect report rather than restating their full history.

Record any additional established Defects in Requirements, Architecture,
Change Design, Implementation, Evaluations, tests, or documentation separately
from suspected Defects. A Bug is itself a realized-system Defect; these
additional Defects describe the cross-stack scope that the authorized
correction may need to coordinate. Do not relabel an unconfirmed cause as a
Defect merely because it appears in the Bugfix.

If the work concerns only a defective Requirement, Architecture representation,
test, or document and no concrete system Bug has been identified, use the
applicable [Change Specification](writing-change-specifications.md) instead of
calling it a Bugfix Specification.

## 3. Record the corrective decision and authority

Apply the shared evidence and authority guide. State which decision selected
corrective change, who or what had authority, and which outcomes remain
possible. Apply the shared metadata guide to priority, target, ownership, and
delivery timing; record them only when already decided by the applicable
authority.

Identifying a Bug does not itself authorize implementation. Keep the decision
to correct separate from the diagnosis and from the later evidence that the
correction worked.

## 4. Establish the expectation and intended correction

Link the accepted Requirement, specification, invariant, contract, or other
authority that the realized system should satisfy. State current defective
behavior and intended corrected behavior separately.

Do not silently create desired state inside the Bugfix Specification. When no
accepted expectation can determine the corrected behavior, preserve the gap
and obtain the applicable Requirement or Architecture decision before treating
the response as authorized.

## 5. Analyze Requirement and Architecture impact

Apply [Analyzing Requirement impact](../control-loop/analyzing-requirement-impact.md)
proportionately. Classify whether the Bugfix:

- restores Implementation satisfaction of unchanged Requirements and
  Architecture;
- exposes a defective or missing Requirement;
- proposes a Requirement or Architecture change that needs separate
  acceptance;
- requires an Evaluation correction or reinterpretation; or
- remains unresolved because the relevant authority is missing or disputed.

Link canonical Requirements and Architecture subjects. Do not copy a binding
obligation into the Bugfix as a second normative authority.

When one Bug implicates several Defects, state which proposed change addresses
each one and which authority must accept it. An authorized Bugfix does not by
itself accept a Requirement or Architecture change.

Most Bugfixes restore satisfaction of unchanged desired state and therefore
must not contain a Requirement-change entry. When the authorized response does
change desired state, apply [Specifying Requirement
changes](specifying-requirement-changes.md) to develop each candidate addition,
revision, retirement, replacement, split, or merge. Keep those candidate
changes distinct from the correction until the applicable authority accepts
them. If accepted corrected behavior does not yet exist, that missing decision
blocks the dependent correction; the Bugfix cannot manufacture it.

Explicitly surface every material missing, underdeveloped, misplaced,
disputed, or contradicted Requirement, Surface, C4 element, responsibility,
boundary, or Evaluation route. Use the shared [candidate Architecture and
Requirements
guide](../architecture/developing-candidate-architecture-and-requirements.md)
and only the element guides implicated by the evidence. For each gap state its
evidence, impact on the correction, stable options or candidate repair,
recommendation, applicable authority, and blocking status.

A missing accepted expectation, unresolved Requirement subject, or disputed
boundary that determines the correction is blocking: complete the Bugfix draft
only to the point that remains truthful, then stop before dependent delivery or
mutation. A missing evaluation route is normally non-blocking when corrected
behavior and Architecture are already accepted; preserve the gap and recommend
the needed Evaluation work while allowing the Bugfix Specification to proceed.
Do not turn either kind of gap into accepted meaning inside the Bugfix.

## 6. Bound scope, constraints, and non-goals

State affected behavior, actors, data, interfaces, components, environments,
and versions only as far as they shape the correction. Preserve unchanged
constraints and invariants that the Bugfix must conserve. Name explicit
non-goals when they prevent the correction from becoming an opportunistic
feature or unrelated refactor.

## 7. Develop the proportional Change Design

Use [Developing a Change Design](../design/developing-a-change-design.md) for
the technical response. Capture only the choices needed to resolve present
ambiguity, such as:

- affected responsibilities, interactions, and boundaries;
- state, data, interface, and failure behavior;
- compatibility, migration, rollout, and rollback;
- alternatives and consequential tradeoffs;
- operational and security risks; and
- unresolved questions that can still change implementation.

The Change Design may live in the Bugfix work item or in a linked authoritative
design discussion. Accepted durable architecture choices retain an independent
Architecture Decision Record when their lifecycle requires one.

## 8. Define verification conditions

State observable conditions that would show the correction satisfies the
applicable expectation. Include the original failing or static case and
material adjacent, negative, boundary, and regression cases.

Do not define success as “the proposed code was merged.” Verification should
remain valid if another implementation satisfies the same obligations and
constraints.

## 9. Describe the Evaluation or testing strategy

Explain how evidence will be gathered across the necessary levels,
environments, fixtures, data, integration boundaries, and operational checks.
Link existing Evaluation Protocols and identify any that need creation,
correction, rerun, or reinterpretation.

Keep verification conditions distinct from the strategy used to gather
evidence. Keep expected future evidence distinct from Evaluation Results that
actually exist.

## 10. Plan delivery and recovery proportionately

Record the authorized implementation sequence, dependencies, decomposition,
rollout, observability, rollback, and ownership needed for the current planning
horizon. Link host-native child tasks rather than forcing every execution
detail into the Specification; those tasks remain outside the Gen Stack
work-item taxonomy.

One Bugfix Specification may address several Bugs and coordinate changes for
several related Defects. One Bug or related Defect may require several changes
with independent authority, delivery, or rollback. Preserve these links
instead of assuming a one-to-one parent-child shape.

## 11. Derive the title and summary last

Title the corrected behavior and discriminating condition rather than the
reporter's wording, a presumed file, or the implementation mechanism:

> Preserve zero-value invoice lines when tax detail is exported

A linked Defect report may remain titled `Invoice export omits zero-value lines
when tax details are included`. These titles coexist: the report names the
observed discrepancy, while the Bugfix names the authorized corrected outcome.
Never obtain the Bugfix title by retitling the report.

Avoid `Fix defect report #482`, the report's title copied unchanged, a presumed
code location, or an implementation mechanism that does not define the
accepted boundary. Put Defect-report identifiers and relationships in links or
structured fields, and omit a `Bugfix` prefix when the surrounding surface
already shows the type.

The summary should name the established Bug, the bounded authorized
correction, and why the response matters. Do not put evidence, scope, or
authority only in the brief; see
[Titling and summarizing work items](titling-and-summarizing-work-items.md).

## Tracker-ready template

Use the smallest sections that make the authorized correction implementable
and reviewable. Omit unsupported sections rather than inventing content.

```markdown
# <Corrected behavior> when <condition>

## Summary

Which Bugs anchor the correction, which related Defects shape its scope, what
bounded outcome should change, and why does that matter?

## Bugs, related Defects, and provenance

- Identified Bugs:
- Established related Defects:
- Remaining defect hypotheses:
- Defect reports:
- Related incidents, occurrences, or regressions:
- Confirmed scope and remaining uncertainty:

## Corrective decision

- Decision and authority:
- Rationale:
- Priority, target, or owner when already decided:

## Expected and corrected behavior

- Applicable Requirements or other expectation:
- Current defective behavior or condition:
- Intended corrected behavior:

## Requirement and Architecture impact

- Impact classification:
- Applicable Requirements:
- Affected Architecture and decisions:
- Candidate authority changes requiring acceptance:
- Material cross-stack gaps, evidence, and impact:
- Options and recommendation:
- Applicable authority and blocking status:

## Proposed Requirement changes

Include only when the response changes desired state. Use one
Requirement-change entry per independently decidable change; otherwise state
`None — restores satisfaction of unchanged Requirements`.

## Scope and constraints

- Affected scope:
- Unchanged constraints and invariants:
- Non-goals:

## Change Design

Material choices, responsibilities, interactions, state and data behavior,
failure handling, alternatives, tradeoffs, risks, and open questions.

## Verification

### Verification conditions

Observable conditions that establish the correction and material regressions.

### Evaluation or testing strategy

How, where, and with which identified Evaluation Protocols the evidence will
be gathered.

## Delivery and recovery

- Implementation sequence and dependencies:
- Host-native implementation tasks:
- Rollout and observability:
- Rollback or recovery:
- Residual risk:
```

## Final check

- The Bugfix has a separate identity; no Defect report was retitled or
  replaced.
- Every material Defect report remains linked as Provenance.
- At least one concrete Bug and an authorized corrective decision are both
  present.
- Established related Defects are distinguished from remaining hypotheses,
  and each proposed correction retains its applicable authority.
- Diagnosis, correction authority, and verification evidence remain distinct.
- Current and corrected behavior have an accepted basis or a visible authority
  gap.
- Material cross-stack gaps include evidence, impact, options or a candidate
  correction, a recommendation, authority, and blocking status.
- A blocking meaning gap stops dependent correction work, while a non-blocking
  gap does not prevent an otherwise truthful Bugfix Specification.
- Requirement and Architecture impact is explicit without creating a second
  normative authority.
- Requirement-change entries appear only when desired state changes; a normal
  Bugfix states that it restores unchanged Requirements.
- Any proposed Requirement addition, revision, retirement, replacement, split,
  or merge follows the common identity, lifecycle, lineage, authority, blocker,
  and consequence guidance.
- Scope, unchanged constraints, and non-goals prevent accidental feature work.
- Change Design is proportional and consequential unknowns remain open.
- Verification conditions are behavioral; the Evaluation or testing strategy
  explains how evidence will be gathered.
- Delivery, rollout, rollback, and residual risk are proportional to the
  change.
- Relationship cardinalities are preserved rather than forced into one report,
  one Defect, one Bug, and one Bugfix.
