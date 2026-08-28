---
type: Guide
title: Reviewing candidate implementations
description: Use when a stable implementation checkpoint needs focused course-correction review or an exact final candidate needs independent integrated assessment; keep Architecture, Requirements, Evaluations, Implementation, and whole-change claims separate and return an actionable next route without silently fixing or shipping.
tags: [review, focused-review, implementation-review, change-specification, change-design, requirements, architecture, evaluations, release-readiness]
status: draft
sources:
  - id: evaluation-evidence
    resource: evaluation-as-bounded-evidence.md
    title: Evaluation as bounded evidence
  - id: implementation-guide
    resource: ../implementation/implementing-a-change-plan.md
    title: Implementing a change plan
generated:
  by: codex/gpt-5.6
  at: 2026-08-27T20:00:00Z
---

# Reviewing candidate implementations

> **Authority:** Review produces bounded findings and recommendations. It does
> not repair the candidate, accept desired state, close work items, or authorize
> release unless those actions are separately requested and governed.

Use this Guide after applying [Running a change-realization
stage](../processes/running-change-realization-stages.md).

## Goal

Provide early bounded feedback while implementation can still course-correct,
then determine independently whether one exact final candidate adequately
realizes the accepted change, which evidence supports each separate conclusion,
what remains unknown, and which next activity is justified.

## Two review modes

- A **focused checkpoint review** assesses one stable implementation increment
  through an Architecture, Requirements, Evaluations, or Implementation lens.
  It supplies course-correction feedback and never establishes release
  readiness.
- An **integrated final review** uses a fresh review context to assess the exact
  final candidate through all four lenses plus whole-change integrity. Earlier
  reviews are evidence, not a substitute for independent inspection.

One reusable reviewer role may perform both modes through separate fresh
invocations. A reviewer never mutates the subject. When fresh delegation is
unavailable, label any same-context checkpoint assessment non-independent and
do not claim that the final independence condition was established.

## Review

1. **Bind the mode and subject.** Identify checkpoint or final mode, focus,
   Change, immutable candidate revision or diff, exact Change Specification and
   Change Design revisions, plan, accepted Requirements and Architecture,
   applicable Protocols, performed Executions and Results, repository
   instructions, scope, and review authority. Refuse an ambiguous moving
   target.
2. **Inspect independently.** Read the candidate and material evidence before
   relying on an implementer's conclusion. Review is read-only by default;
   requested fixes return to implementation so the assessed revision remains
   identifiable. Final review inspects primary evidence before consulting
   checkpoint conclusions or their action dispositions.
3. **Assess four independent assurance areas.** Keep these judgments separate:
   - **Requirements:** satisfaction of each changed or materially impacted
     accepted obligation, including positive, negative, boundary, and failure
     behavior;
   - **Architecture:** realization of each changed or impacted responsibility,
     boundary, interface, relationship, decision, and quality property;
   - **Evaluations:** Protocol coverage, Protocol adequacy, executable
     realization, evidence state, and bounded outcome for Requirement-
     satisfaction and Architecture-realization claims; and
   - **Implementation:** Design conformance or explained divergence,
     correctness, maintainability, safety, and separate Implementation-
     conformance Evaluations.
4. **Apply whole-change integrity.** In final review, and whenever a focused
   review exposes a material cross-domain concern, inspect Specification and
   Design reconciliation; migration, operations, observability, rollback, and
   recovery; plan and scope completion; corpus coherence; provenance; stale or
   undispositioned checkpoint findings; and newly exposed definition gaps.
5. **Find concrete problems.** For each finding, assign a stable identity and
   state the affected authority or candidate revision and location, violated
   expectation or risk, evidence, consequence, confidence, required outcome,
   and responsible route. Do not report style preferences as correctness
   findings or infer broad assurance from one passing check.
6. **Exercise proportionately.** Run only authorized read-only or safely
   bounded checks whose provenance and effects are understood. Preserve
   failures, skipped work, harness errors, stale evidence, and unknowns.
7. **Recommend a route.** Checkpoint review uses `continue`,
   `implementation-revision-required`, `definition-reconciliation-required`,
   `more-evidence-required`, or `unable-to-assess`. Final review uses
   `ready-for-release-decision`,
   `implementation-revision-required`, `definition-reconciliation-required`,
   `more-evidence-required`, or `unable-to-assess`. A recommendation is not a
   release decision.

## Action-oriented result

```markdown
# Review: <Change and exact subject>

> **Subject:** <exact immutable revision or diff>
> **Mode:** `<checkpoint | final>`
> **Focus:** `<architecture | requirements | evaluations | implementation | integrated>`
> **Result:** <one allowed disposition or recommendation>

## Decision

- **Release readiness:** <not assessed | ready | not ready | not established>
- **Basis:** <one or two sentences>
- **Blocking findings:** <IDs or None>
- **Material unknowns:** <IDs or None>

## Required actions

### A-1 — <priority> — <required outcome>

- **Owner:** <responsible role>
- **Done when:** <observable completion condition>
- **Finding:** <F-ID>

## Findings

### F-1 — <severity> — <actionable title>

- **Affects:** <exact authority or candidate revision and location>
- **Problem:** <violated expectation or risk>
- **Consequence:** <why it matters>
- **Evidence and confidence:** <concise evidence and confidence>
- **Required outcome:** <resolution without unnecessary prescription>
- **Route:** <spec | design | plan | implement | investigate | evaluation owner>

## Assurance summary

| Area | Disposition | Key conclusion | Findings or unknowns |
| --- | --- | --- | --- |
| Requirement satisfaction | <disposition> | <one line> | <IDs or —> |
| Architecture realization | <disposition> | <one line> | <IDs or —> |
| Semantic evaluation quality | <disposition> | <one line> | <IDs or —> |
| Implementation quality | <disposition> | <one line> | <IDs or —> |
| Whole-change integrity | <disposition> | <one line> | <IDs or —> |

## Material unknowns

### U-1 — <title>

- **Missing evidence:** <what is unavailable>
- **Prevents conclusion about:** <bounded claim>
- **Evidence needed:** <specific artifact or check>
- **Owner:** <responsible role>

## Review boundary

- **Compared with:** <exact accepted authorities and artifact revisions>
- **Included:** <scope>
- **Excluded:** <scope>
- **Checks performed:** <concise list or evidence links>
- **Prior review evidence:** <identities or None>
```

Use `SUPPORTED`, `ACTION REQUIRED`, `UNKNOWN`, and `NOT APPLICABLE` for review
dispositions. Evaluation Results retain `pass`, `fail`, and `unknown`. Keep
successful checklist detail behind the summary. Omit empty action, finding, and
unknown bodies, but keep the Decision and Assurance summary. When no finding is
supported, state the inspected scope and residual uncertainty rather than
claiming universal correctness.

## Final check

- The exact candidate and comparison authorities are identifiable.
- Checkpoint feedback and final independent review remain distinguishable.
- Findings are evidence-backed and actionable by their proper owner.
- Requirements, Architecture, Evaluations, Implementation, and whole-change
  claims were not collapsed into one verdict.
- Review did not mutate the candidate or infer release authority.
- The recommended next route follows from the evidence.
