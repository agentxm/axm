---
type: Explanation
title: Bugs and bugfix specifications
description: How investigation can identify a concrete Bug from one or more Defect reports, why the reports remain separate provenance, and how a Bugfix Specification drives an authorized corrective change.
tags: [bug, defect, defect-report, bugfix, bugfix-specification, corrective-change, provenance, change-design, verification, work-item]
status: draft
sources:
  - id: gen-stack-vocabulary
    resource: ../glossary.md
    title: Gen Stack vocabulary and relationship model
  - id: defect-reports
    resource: failures-defects-and-defect-reports.md
    title: Failures, defects, and defect reports
  - id: change-design
    resource: ../design/change-design.md
    title: Change Design
  - id: change-specifications
    resource: change-specifications.md
    title: Change specifications
  - id: iso-24765
    resource: https://www.iso.org/standard/71952.html
    title: ISO — ISO/IEC/IEEE 24765:2017 Systems and software engineering vocabulary
  - id: iso-29119-1
    resource: https://www.iso.org/standard/81291.html
    title: ISO — ISO/IEC/IEEE 29119-1:2022 Software testing general concepts
generated:
  by: codex/gpt-5.6
  at: 2026-08-26T20:14:40Z
---

# Bugs and bugfix specifications

> **Authority:** The [Gen Stack vocabulary and relationship
> model](/glossary.md) is authoritative for canonical terms and relationships.
> This Explanation develops understanding without redefining them. When it
> discusses a profile-governed corpus representation, the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) governs that representation.
> This document adds neither semantic authority nor profile-conformance rules.

A **Defect report** preserves an observed or received Signal and the evidence,
investigation, and decisions that follow. Investigation may identify a
**Bug**: concrete defective behavior or a defective condition in the realized
system. When an authorized decision selects corrective change, a separate
**Bugfix Specification** composes the meaning and work needed to deliver and
verify that change.

These artifacts are related, but none is a later title or maturity state of
another. Their separation protects the originating Signal and Provenance while
allowing corrective work to take the shape its own scope, authority, design,
and delivery require.

## Four distinct roles

| Concept | What it establishes | What it does not establish |
| --- | --- | --- |
| Defect | An imperfection or deficiency exists in the system or a work product such as a Requirement, Architecture, Change Design, Implementation, Evaluation, test, or document | That the Defect has produced observable system behavior or that a correction is authorized |
| Defect report | An observation, received concern, or static finding and its Provenance are being preserved and investigated | That a Defect or Bug exists, or that the report specifies a change |
| Bug | Investigation has identified a Defect expressed as concrete defective behavior or a defective condition in the realized system | That the Bug must be corrected now, that every contributing Defect is known, or that one mechanism will correct it |
| Bugfix Specification | An authorized corrective change for one or more Bugs has a bounded composition that may coordinate changes addressing several related Defects | That the originating Defect reports can be replaced, retitled, or closed, or that proposed authority changes are accepted |

A Defect is deliberately broad. A Requirement can be incomplete, Architecture
can assign the wrong responsibility, a test can assert the wrong result, and
Implementation can realize defective behavior. Not every Defect is a Bug. Bug
is the narrower term for a Defect expressed as concrete system behavior or
condition and established through investigation. One Bug may arise from, be
sustained by, or expose several additional Defects across those work products.

## The relationship is a network

```text
Observation, received concern, or static finding
                         │
                         ▼
                  Defect report
            Signal, evidence, Provenance
                         │
                  investigation
              ┌──────────┼──────────────┐
              ▼          ▼              ▼
          no Defect   Defect(s)         Bug
                     without a Bug       │
                                        ├── may implicate additional Defects
                                        │   in Requirements, Architecture,
                                        │   Implementation, Evaluations, etc.
                                        │
                                authorized correction
                                        │
                                        ▼
                               Bugfix Specification
                               Change Design, delivery,
                               and verification context
                                        │
                                        ▼
                               corrective Action and
                               verification evidence
```

The diagram is explanatory, not a required pipeline. Static investigation may
identify a Bug before a runtime Failure is observed. A report may remain
unresolved or close without a Bug. A Bug may be deferred, compensated for, or
accepted as risk rather than corrected.

The relationships are many-to-many:

- several Defect reports can provide evidence for one Bug;
- one report can reveal several Bugs or other Defects;
- one Bug can implicate several additional Defects, and one Defect can
  contribute to several Bugs;
- one Bugfix Specification can respond to several related Bugs and coordinate
  changes addressing several related Defects; and
- one Bug or related Defect can require several independently delivered and
  authorized changes.

Links preserve those facts without merging the artifacts or their lifecycles.

## Why Defect reports remain separate

The Defect report owns the history of what entered the system of work: who or
what observed or reported it, under which conditions, which expectation was
cited, what evidence was available, and how investigation changed the current
understanding. Recasting that record as implementation coordination hides the original
uncertainty and can make a later diagnosis appear to have been known at intake.

A Bugfix Specification begins from a different decision. It exists because an
authorized correction is being shaped and delivered. Its title, owner, status,
scope, decomposition, risks, and verification horizon may differ substantially
from every report that supports it. Retitling a Defect report as a Bugfix would
therefore lose Provenance and impose a false one-to-one lifecycle.

The Bugfix Specification should link the applicable Defect reports and carry
only the synopsis needed to understand the change. The reports retain their
full source evidence and investigation history.

## Naming makes the boundary visible

The two artifacts should remain distinguishable even on a board or search
result that exposes only their titles:

| Artifact | What its title names | Pattern |
| --- | --- | --- |
| Defect report | The observed discrepancy or static finding | `<affected behavior or artifact> <observed result or finding> when <condition>` |
| Bugfix Specification | The authorized corrected behavior | `<corrected behavior> when <condition>` |

For example, `Invoice export omits zero-value lines when tax details are
included` remains the Defect report, while `Preserve zero-value invoice lines
when tax detail is exported` names the Bugfix Specification. The second title
does not supersede the first; both remain linked because they describe
different work and carry different lifecycle state.

Put report identifiers and many-to-many relationships in links or structured
fields rather than titles such as `Fix defect report #482`. Omit `Defect
report` or `Bugfix` prefixes when the host already displays the item type. For
the shared title and summary procedure, see
[Titling and summarizing work items](titling-and-summarizing-work-items.md).

## What a Bugfix Specification composes

A Bugfix Specification is a specialized [Change
Specification](change-specifications.md), not a new semantic
authority. At the granularity needed for the correction, it may contain or
reference:

- the identified Bugs, established related Defects, remaining defect
  hypotheses, and linked Defect reports;
- the decision and authority to correct it;
- applicable Requirements and the accepted expectation;
- affected Architecture responsibilities, boundaries, and decisions;
- current defective behavior and the intended corrected behavior;
- unchanged constraints, invariants, and explicit non-goals;
- a proportional [Change Design](../design/change-design.md);
- verification conditions and regression context;
- an Evaluation or testing strategy; and
- implementation sequencing, rollout, rollback, and residual risk.

Each constituent keeps its own authority. Coordinating several Defect
corrections does not merge their meanings or lifecycles. A Bugfix Specification
can propose a Requirement or Architecture change, but it cannot accept one. It
can identify Implementation to change, but current code does not become the
source of desired behavior. Its verification context explains what evidence is
needed; an Evaluation Execution and Result own the actual assessment and
evidence.

## Container and lifecycle

A dedicated work item commonly serves as the Bugfix Specification container.
The Specification may also span a linked design discussion and delivery
items, but the separate Bugfix identity remains the navigation point for the
authorized correction. It is never the Defect report under a new title.

Bugfix status follows corrective work: proposed, authorized, designed, in
delivery, implemented, verified, deferred, or superseded according to the
host. Defect-report status follows evidence and disposition. Completing one
does not silently transition the other; record verification and closure in
each artifact according to its own purpose and host workflow.

[Maintaining work-item identity, relationships, and
lifecycle](maintaining-work-item-identity-relationships-and-lifecycle.md) owns
the common procedure for those separate identities and transitions. [Managing
work-item metadata and labels](managing-work-item-metadata-and-labels.md) owns
their host-field projection.

For the authoring procedure and adaptable work-item template, see
[Writing bugfix specifications](writing-bugfix-specifications.md). For intake
and investigation, see [Recording defect reports](recording-defect-reports.md).
For provenance and corrective authority shared across the pair, see
[Preserving evidence and authority in software work
items](preserving-work-item-evidence-and-authority.md).
