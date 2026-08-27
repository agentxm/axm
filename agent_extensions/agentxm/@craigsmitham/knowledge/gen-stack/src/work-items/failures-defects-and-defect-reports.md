---
type: Explanation
title: Failures, defects, and defect reports
description: How observations and anomalies become classified defect reports; how failures, defects, incidents, corrections, verification, and closure differ; and why tracker labels do not prove diagnosis.
tags: [anomaly, defect, bug, failure, error, defect-report, static-testing, dynamic-testing, traceability, resolution, verification, work-item]
status: draft
sources:
  - id: istqb-foundation
    resource: https://www.istqb.org/wp-content/uploads/2024/11/ISTQB_CTFL_Syllabus_v4.0.1.pdf
    title: ISTQB Certified Tester Foundation Level Syllabus v4.0.1
  - id: iso-29119-1
    resource: https://www.iso.org/standard/81291.html
    title: ISO — ISO/IEC/IEEE 29119-1:2022 Software testing general concepts
  - id: iso-29119-3
    resource: https://www.iso.org/standard/79429.html
    title: ISO — ISO/IEC/IEEE 29119-3:2021 Test documentation
  - id: iso-29148
    resource: https://www.iso.org/standard/72089.html
    title: ISO — ISO/IEC/IEEE 29148:2018 Requirements engineering
  - id: azure-bug
    resource: https://learn.microsoft.com/en-us/azure/devops/boards/backlogs/manage-bugs
    title: Microsoft Azure Boards — Define, capture, triage, and manage bugs
  - id: github-issue-types
    resource: https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/managing-issue-types-in-an-organization
    title: GitHub Docs — Managing issue types in an organization
generated:
  by: codex/gpt-5.6
  at: 2026-08-26T20:14:40Z
---

# Failures, defects, and defect reports

> **Authority:** The [Gen Stack vocabulary and relationship
> model](/glossary.md) is authoritative for canonical terms and relationships.
> This Explanation develops understanding without redefining them. When it
> discusses a profile-governed corpus representation, the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) governs that representation.
> This document adds neither semantic authority nor profile-conformance rules.

A **defect** is an imperfection or deficiency in the system or in a work
product that describes, governs, realizes, or evaluates it. A **failure** is
observed behavior that does not meet an applicable expectation during
execution. A **defect report** is the living case record used to preserve an
observed or received concern, its Provenance, and the evidence and
investigation that follow.

The report and the defect are not the same thing. Filing a report establishes
that an anomaly or concern was recorded. It does not by itself prove that a
defect exists, locate its cause, select a correction, establish severity or
priority, or show that a resolution has been verified.

## Observation is not diagnosis

Several concepts that trackers often collapse answer different questions:

| Concept | What it establishes | What it does not establish |
| --- | --- | --- |
| Observation or occurrence | Something was seen, measured, reported, or found in a particular context | That the observation is correct, repeatable, or caused by the product |
| Anomaly | The observation differs from an expectation or warrants investigation | That the underlying cause is a defect |
| Failure | Executed behavior did not meet an applicable expectation | Which work product contains the defect |
| Defect | A flaw exists in code, requirements, configuration, tests, documentation, or another work product | Which correction should be chosen or when it will be delivered |
| Defect report | Evidence, classification, investigation, decisions, relationships, and status are managed in one traceable record | That every claim in the record is confirmed |
| Bug | Investigation identified a Defect expressed as concrete defective behavior or a defective condition in the realized system | That correction is authorized, that every contributing Defect is known, or that one report maps to one Bug |
| Bugfix Specification | An authorized corrective change for one or more Bugs is bounded and may coordinate changes addressing several related Defects | That its Defect reports can be retitled, replaced, or closed, or that proposed authority changes are accepted |
| Correction or fix | A change was made to remove or compensate for a cause | That the original discrepancy and relevant regressions were verified |
| Verification evidence | The chosen resolution satisfies its stated conditions | That every related risk or occurrence has disappeared |

ISTQB therefore treats initial reports as reported anomalies: investigation
may classify them as real defects, false-positive results, change requests, or
something else.[^istqb-foundation] Requiring reporters to prove a root cause
before filing suppresses useful evidence and encourages speculation.

An **error** or mistake by a person can introduce a defect, and executing a
defective work product under relevant conditions can produce a failure. That
is one causal pattern, not a mandatory discovery sequence. A dependency,
environment, incorrect test, or disputed expectation can produce a similar
observation, while a static review can find a defect before anything executes.

## Static findings and dynamic failures

A defect report can begin from different evidence:

| Evidence path | Typical observation | Useful context |
| --- | --- | --- |
| Dynamic test or production execution | Wrong result, crash, timeout, resource leak, degraded quality, or another failure | Starting state, actions or events, environment, test data, timing, frequency, and actual result |
| Static analysis, inspection, or review | A work product violates a rule, requirement, invariant, or accepted convention | Artifact and revision, location, applicable rule or expectation, observed content, and analysis or review evidence |
| Monitoring, support, or operational incident | One or more reported occurrences suggest a recurring discrepancy | Source, timestamps, correlation evidence, affected scope, and links to the occurrence or incident record |

The report should preserve the evidence path without forcing every case into
runtime reproduction steps. ISO/IEC/IEEE 29119 defines common testing concepts
separately from the test-documentation templates produced by testing
processes.[^iso-29119-1][^iso-29119-3]

## From anomaly to resolution

The lifecycle is a network of evidence and decisions, not a ticket-conversion
pipeline:

```text
Observation, test result, review finding, alert, or reported occurrence
                              │
                              ▼
                     Reported anomaly
                              │
                triage, analysis, and classification
          ┌───────────┬───────┼───────────┬──────────────┐
          ▼           ▼       ▼           ▼              ▼
      confirmed   duplicate  expected   external      unresolved or
     Defect or Bug           behavior     cause       more evidence needed
          │
          ├── compensation, deferment, accepted risk, or correction
          ▼
   separate Bugfix Specification when a Bug and correction are authorized
          │
          ▼
     verification evidence
          │
          └── close, reopen, or link a new regression occurrence
```

Several occurrences may support one canonical defect report. One report may
split when investigation reveals unrelated causes. One defect may cause many
failures or incidents, and one failure may have several contributing defects.
Preserve these relationships rather than forcing every occurrence, diagnosis,
and correction into one oversized ticket.

The reporter's participation may also continue after intake. Investigators
can request another observation, a changed configuration, or a rerun with
additional instrumentation. New evidence should be appended with its source
and time instead of silently rewriting an earlier hypothesis as fact.

## Expectations and traceability

A discrepancy needs an expectation against which it can be evaluated. The
basis may be a requirement, acceptance criterion, specification, contract,
domain rule, quality threshold, test oracle, invariant, or accepted behavior.
When the expectation is disputed or incomplete, the report should preserve
that uncertainty; an apparent product defect may instead reveal a defective
requirement, test, or document.

Requirement quality is therefore relevant to defect classification, not an
intake gate. Qualities such as clarity, completeness, consistency, feasibility,
and verifiability help investigators test whether the cited basis can support
the claimed discrepancy. ISO/IEC/IEEE 29148 governs requirements-engineering
processes and requirements information items.[^iso-29148] When the basis is
itself defective, preserve the observation and link the requirement correction
instead of silently rewriting the expectation inside the defect report.

Useful traceability connects the whole reasoning chain:

```text
Expectation or test basis
        ↕
Test, review, observation, or occurrence evidence
        ↕
Defect report, classification, and identified Bug
        ↕
Separate Bugfix Specification and corrective change
        ↕
Verification result and residual risk
```

This makes later questions answerable: which expectation was violated, which
evidence supported the classification, which change claimed to resolve it,
and which result justified closure.

## Why tracker labels do not prove maturity

Tools expose workflow containers rather than universal semantic definitions:

| Host vocabulary | What it establishes |
| --- | --- |
| GitHub `Bug` | A default issue type alongside Feature and Task |
| Azure `Bug` | A configurable work item with process-specific fields, states, and closure reasons |
| ISO/IEC/IEEE 29119 `incident report` | Test documentation for an anomalous occurrence, also commonly called a defect or bug report |

GitHub's label does not prove root cause, while Azure distinguishes resolution,
verification, closure reasons, duplicates, and reactivation in its default
processes.[^github-issue-types][^azure-bug] Portable guidance can therefore
teach *defect report* as the semantic artifact while allowing the host to
supply its issue type, fields, and workflow.

[Managing work-item metadata and
labels](managing-work-item-metadata-and-labels.md) supplies the common procedure
for projecting that meaning into host fields without treating labels as proof.

The host also owns whether a recurrence reopens an existing report or creates
a new linked item. Azure, for example, recommends a new linked bug for a
regression rather than reopening the earlier one.[^azure-bug] The portable
requirement is to preserve the relationship and the new evidence, not to force
one workflow rule everywhere. [Maintaining work-item identity, relationships,
and lifecycle](maintaining-work-item-identity-relationships-and-lifecycle.md)
owns the common procedure.

## Severity, priority, status, and resolution

These fields express different decisions:

| Field | Meaning |
| --- | --- |
| Severity | Degree of impact on stakeholders, requirements, or the product |
| Priority | Relative scheduling or attention decision made by the applicable authority |
| Status | Where the report currently sits in the host workflow |
| Classification | What the available evidence says the anomaly represents |
| Resolution | Which disposition was chosen and why |
| Verification result | What evidence shows whether that disposition satisfied its conditions |

A severe defect can have an improbable trigger; a small defect can be
strategically urgent. A merged correction is not yet a verified result, and a
closed report does not always mean code changed. Legitimate dispositions
include corrected and verified, duplicate, expected behavior, external cause,
not reproducible with current evidence, deferred, or accepted risk.

`Not reproducible` describes the present investigation, not proof that no
defect exists. Missing environment state, transient dependencies, timing,
data, or an intermittent trigger can prevent reproduction. Closure or
deferment should therefore retain the evidence, rationale, and conditions that
would justify revisiting the decision.

## Choosing a neighboring artifact

Use or link another artifact when:

- current or imminent service impact requires coordinated response — create
  an [operational incident record](operational-incident-records.md);
- there is no accepted expectation and a bounded system or Architecture change
  is being proposed — create a [Change
  Specification](change-specifications.md); retain an
  unbounded request as a Signal or source record;
- only uncertainty reduction has been authorized — continue Orientation or
  conduct bounded investigation activity within the current case;
- investigation has identified a Bug and an accepted correction needs design,
  delivery, and verification context — create a separate
  [Bugfix Specification](bugs-and-bugfix-specifications.md), link its Defect
  reports as Provenance, and never retitle them; or
- the report contains a suspected security vulnerability — use the
  organization's private vulnerability-reporting channel rather than exposing
  exploit details in an ordinary public issue.

For the recording procedure and tracker-ready template, see
[Recording defect reports](recording-defect-reports.md).
For the corrective-change procedure, see
[Writing bugfix specifications](writing-bugfix-specifications.md).
For source occurrence, claim-state, and decision-authority handling shared by
both, see [Preserving evidence and authority in software work
items](preserving-work-item-evidence-and-authority.md).

[^azure-bug]: Microsoft Azure Boards, “Define, capture, triage, and manage bugs.”
[^github-issue-types]: GitHub Docs, “Managing issue types in an organization.”
[^iso-29119-1]: ISO/IEC/IEEE 29119-1:2022, software-testing general concepts.
[^iso-29119-3]: ISO/IEC/IEEE 29119-3:2021, software-test documentation templates.
[^iso-29148]: ISO/IEC/IEEE 29148:2018, requirements-engineering processes and requirements information items.
[^istqb-foundation]: ISTQB Certified Tester Foundation Level Syllabus v4.0.1, sections on testing and debugging, defect management, and defect-report contents.
