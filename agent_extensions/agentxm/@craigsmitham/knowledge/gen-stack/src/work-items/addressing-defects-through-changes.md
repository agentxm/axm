---
type: Guide
title: Addressing defects through Changes
description: Use when a bounded Change has the explicit remedial purpose of correcting or acceptably compensating for established Defects; classify it as a Bugfix, preserve Defect provenance, and apply the ordinary Change Specification and Change Design contracts.
tags: [change, bugfix, defect, defect-report, remediation, correction, compensation, provenance, regression]
status: draft
sources:
  - id: changes
    resource: changes.md
    title: Changes
  - id: defect-model
    resource: failures-defects-and-defect-reports.md
    title: Failures, defects, and defect reports
  - id: change-specification-guide
    resource: writing-change-specifications.md
    title: Writing Change Specifications
generated:
  by: codex/gpt-5.6
  at: 2026-08-27T21:55:00Z
---

# Addressing defects through Changes

> **Authority:** This Guide applies the canonical meaning in the [Gen Stack
> vocabulary and relationship model](../glossary.md). It does not establish a
> Defect, select remediation, accept changed desired state, or authorize
> delivery.

Use this guide when one bounded Change has an explicit remedial purpose for
one or more established Defects. Apply the ordinary [Writing Change
Specifications](writing-change-specifications.md) and [Developing a Change
Design](../design/developing-a-change-design.md) contracts. Do not create a
different specification or design template.

## 1. Confirm Bugfix classification

Classify the Change as a **Bugfix** only when:

- evidence establishes at least one Defect relative to an applicable
  expectation or intended use;
- an authorized decision selects remediation; and
- remediation is an explicit purpose of this Change.

Remediation can be a correction or an accepted compensation. Investigation,
diagnosis, deferment, monitoring, or acceptance of risk without remedial
change is not a Bugfix. If the possible Defect is still uncertain, continue
triage or investigation. If maintenance has no established Defect, keep it an
ordinary Change.

The informal lowercase word *bug* may be used as shorthand for a realized-
system Defect. It is not a separate canonical concept or work-item role.

## 2. Preserve separate identities

Create or retain one Change identity and link every material Defect Report,
incident, occurrence, and evidence source. Never retitle a Defect Report into
the Change, copy its full chronology, or close it merely because remediation
was authorized.

Summarize only what the Change needs:

- established Defects and affected work products;
- current defective condition and applicable expectation;
- selected remedial outcome and authority;
- remaining hypotheses or disputed scope; and
- links to source evidence and investigation.

One Change may remediate several Defects, and one Defect may require several
Changes. Preserve those relationships explicitly.

## 3. Distinguish restored and changed desired state

For each affected Requirement and Architecture authority, state whether the
Change:

- restores satisfaction or realization of unchanged accepted meaning;
- repairs a defective Requirement, Architecture representation, Evaluation,
  test, documentation artifact, or other work product;
- proposes changed desired state requiring its own acceptance; or
- is blocked because the applicable expectation or boundary is missing or
  disputed.

A Bugfix is not limited to implementation defects. The broad Defect definition
also covers work products that govern, describe, or evaluate the system.

Do not manufacture corrected behavior when no accepted expectation determines
it. A missing load-bearing expectation, Requirement subject, Architecture
boundary, or required semantic Evaluation Protocol blocks ratification,
coherence, and dependent planning until its authority resolves it.

## 4. Add correction and regression semantics

In the ordinary Change Specification, ensure the relevant
Requirement-satisfaction and Architecture-realization Protocols semantically
cover:

- the established failing condition;
- intended corrected or compensated behavior;
- material adjacent, negative, boundary, compatibility, migration, and
  regression conditions; and
- pass, fail, and inconclusive judgment with appropriate evidence.

Keep this at the semantic level. The Change Design owns executable Suites,
Cases, fixtures, environments, instrumentation, and evidence flow.

## 5. Reconcile mixed scope

If the Change also contains evolutionary improvement, keep one Change only
when the outcome, authority, rollout, and recovery boundary remain coherent.
Record Bugfix classification and make the additional scope explicit. Split the
work when either part needs independent acceptance, delivery, verification, or
rollback.

## Final check

- Every Bugfix classification is grounded in an established Defect and an
  authorized remedial purpose.
- Defect Reports remain separate provenance-bearing records.
- The Change uses the standard Change Specification and Change Design
  contracts without extra or renamed artifact types.
- Unchanged and changed desired state are distinguished.
- Correction and regression Protocol meaning is complete before coherence is
  claimed.
- Change completion does not silently close source records.
