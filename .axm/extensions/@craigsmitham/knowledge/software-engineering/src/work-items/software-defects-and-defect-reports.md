---
type: Explanation
title: Software defects and defect reports
description: How defects differ from errors and observed failures, why a report can begin before the cause is confirmed, and how defect work relates to incidents and requested functionality.
tags: [defect, bug, failure, error, anomaly, defect-report, testing, quality, work-item]
status: draft
sources:
  - id: istqb-foundation
    resource: https://www.istqb.org/wp-content/uploads/2024/11/ISTQB_CTFL_Syllabus_v4.0.1.pdf
    title: ISTQB Certified Tester Foundation Level Syllabus v4.0.1
  - id: azure-bug
    resource: https://learn.microsoft.com/en-us/azure/devops/boards/backlogs/manage-bugs
    title: Microsoft Azure Boards — Define, capture, triage, and manage bugs
  - id: github-issue-types
    resource: https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/managing-issue-types-in-an-organization
    title: GitHub Docs — Managing issue types in an organization
generated:
  by: codex/gpt-5
  at: 2026-08-16T00:17:02Z
---

# Software defects and defect reports

A **defect** is an imperfection in a software work product that prevents it
from meeting an accepted requirement, specification, or other authoritative
expectation. A **defect report** is the work artifact used to record and manage
evidence of that discrepancy.

The distinction matters because the first thing observed is often not the
defect itself. ISTQB separates a human error, the defect introduced into a work
product, and a failure that occurs when execution exposes the defect. Defects
can exist in requirements, code, configuration, tests, documentation, and
other lifecycle artifacts.[^istqb-foundation]

## From observation to confirmed defect

```text
Error or contributing condition
└── Defect in a work product
    └── Execution under relevant conditions
        └── Observable failure
            └── Defect report and investigation
```

Real work rarely discovers these in this order. A person may report a failure
without knowing whether its cause is product code, test data, environment,
configuration, an incorrect expectation, or a dependency. The report can
therefore begin as a suspected discrepancy and later be confirmed, rejected,
merged, or reclassified.

Requiring reporters to prove the root cause before filing suppresses useful
evidence and encourages speculation. Requiring an expectation and an observed
departure is more useful: it establishes what needs investigation without
pretending the diagnosis is complete.

## Neighboring concepts

| Concept | Represents | Boundary from a defect report |
| --- | --- | --- |
| Failure | Observed behavior that does not meet an expectation | Evidence of a possible defect, not the flaw itself |
| Incident | A time-bounded disruptive occurrence requiring response | May expose a defect, but closes when impact ends |
| Feature request | Desired new or changed functionality | Changes the expectation rather than showing it was already violated |
| Task | An action to perform | May implement a fix after diagnosis, but does not preserve the discrepancy |
| Test case | Conditions and expected results used for evaluation | Can reveal and later verify a defect |

One defect may cause many failures or incidents. One failure can also have
several contributing defects. Preserve these as relationships rather than
forcing every occurrence and correction into one oversized ticket.

## Defect and bug

Testing and systems-engineering sources generally use **defect** for the
broader work-product flaw. General-purpose trackers commonly expose **Bug** as
the tool label: GitHub includes Bug as a default issue type, and Azure Boards
uses a Bug work item with reproduction and expected-behavior fields.
[^github-issue-types][^azure-bug]

A portable practice can therefore teach *defect report* as the concept and map
it to `Bug` where that is the host vocabulary.

## Severity, priority, and resolution

**Severity** describes the degree of impact on stakeholders or requirements.
**Priority** expresses when the organization intends to address the item.
Conflating them hides legitimate cases such as a severe defect with an
improbable trigger or a small but strategically urgent defect.

Resolution is also broader than “code merged.” A defect report reaches its
terminal state when the organization has classified the discrepancy, applied
the chosen resolution, and gathered the evidence required by that resolution.
Possible outcomes include corrected and verified, duplicate, not reproducible,
expected behavior, external cause, deferred, or accepted risk.

For the authoring procedure and a tracker-ready template, see
[Reporting software defects](reporting-software-defects.md).

[^istqb-foundation]: ISTQB Certified Tester Foundation Level Syllabus v4.0.1, sections on errors, defects, failures, and defect reports.
[^azure-bug]: Microsoft Azure Boards, “Define, capture, triage, and manage bugs.”
[^github-issue-types]: GitHub Docs, “Managing issue types in an organization.”
