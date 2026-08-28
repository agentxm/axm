---
type: Guide
title: Triaging defect reports
description: Use when one or more Defect Reports need an evidence-backed disposition and next route; assess current applicability, relate cases, and route material uncertainty to investigation without inventing diagnosis, priority, or corrective authority.
tags: [defect-report, triage, duplicate, overlap, merge, split, classification, routing, severity, priority, investigation, evidence-currency, report-age]
status: draft
sources:
  - id: defect-explainer
    resource: failures-defects-and-defect-reports.md
    title: Failures, defects, and defect reports
  - id: recording-defects
    resource: recording-defect-reports.md
    title: Recording defect reports
  - id: investigating-defects
    resource: investigating-possible-defects.md
    title: Investigating possible defects
  - id: work-item-identity
    resource: maintaining-work-item-identity-relationships-and-lifecycle.md
    title: Maintaining work-item identity, relationships, and lifecycle
  - id: evidence-authority
    resource: preserving-work-item-evidence-and-authority.md
    title: Preserving evidence and authority in software work items
  - id: metadata-labels
    resource: managing-work-item-metadata-and-labels.md
    title: Managing work-item metadata and labels
  - id: process
    resource: ../processes/process.md
    title: Process
generated:
  by: codex/gpt-5
  at: 2026-08-27T21:55:00Z
---

# Triaging defect reports

> **Authority:** This Guide applies the canonical meaning in the [Gen Stack
> vocabulary and relationship model](/glossary.md). When it authors a
> profile-governed corpus concept, the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) owns its required
> representation. This Guide supports action and adds neither semantic authority
> nor profile-conformance rules.

Use this guide when one or more Defect Reports need a current disposition and
an authorized next route. Triage uses available evidence to assess report
identity, current applicability, classification, impact, and routing. It does
not gather new diagnostic evidence, establish a Defect, choose remediation, or
promise delivery.

Use [Recording defect reports](recording-defect-reports.md) for intake. When a
material triage decision requires new evidence, state the smallest question
that would change it and apply [Investigating possible
defects](investigating-possible-defects.md). Investigation owns evidence
selection and gathering, including reproduction; triage resumes with its
bounded conclusion.

## Goal and boundary

Give each report a recoverable, evidence-backed disposition and next route.
Preserve every material occurrence, keep uncertainty visible, route urgent or
restricted cases correctly, and name the decision authority and review trigger.

Triage owns Defect Report identity, relationships, classification, lifecycle
disposition, impact assessment, and next route. An investigation conclusion is
evidence for those decisions; it does not make them automatically.

Record results in the reports' native systems. Use exact native fields and
relationships, link peer records, and keep one canonical owner for each fact.
Apply the shared guides for [evidence and
authority](preserving-work-item-evidence-and-authority.md), [identity and
lifecycle](maintaining-work-item-identity-relationships-and-lifecycle.md), and
[metadata](managing-work-item-metadata-and-labels.md) instead of repeating
their rules here.

## Representation

Use exact native tracker fields and relationships for report identity,
workflow state, classification, severity, priority, assignment, and lifecycle
when their semantics match. Present residual triage content in this order:
scope and authority, current applicability and evidence currency, identity and
relationship disposition, classification and impact, any bounded investigation
question and conclusion, then the next route and review trigger. Preserve each
material occurrence and decision history; do not duplicate host-owned metadata
or move evidence across access boundaries.

## Guardrails

- **Preserve before consolidating.** Retain every material occurrence and its
  Provenance before deciding relationships.
- **Similarity is not identity.** Shared symptoms, components, or timing may
  support a relationship without proving a duplicate or common cause.
- **Age is context, not disposition.** Report age does not establish
  invalidity, low impact, low priority, duplication, or grounds for closure.
- **Triage is not diagnosis.** Keep Observations, hypotheses, Defects, Bugs,
  and investigation conclusions distinguishable.
- **Impact is not priority.** Severity evidence does not authorize assignment,
  scheduling, target dates, or corrective scope.
- **Unknown is valid.** Defer a decision with an explicit question or trigger
  instead of manufacturing confidence.

## Triage the reports

### 1. Bind scope, authority, and urgent routes

Identify the reports, time window, system boundary, and triage authority. Name
which decisions the triager may make and which belong to a product owner,
incident commander, security role, domain authority, maintainer, or another
decision-maker.

Before comparison, route current or imminent qualifying operational impact to
an [Operational Incident Record](recording-operational-incidents.md), possible
vulnerabilities to the private security path, restricted evidence to an
approved channel, and material legal, safety, compliance, or data-integrity
concerns to their designated authority. Keep each Defect Report as Provenance;
escalation changes handling, not what was observed.

### 2. Preserve and compare reports

Preserve every material occurrence, its source, stable identifier, safe
evidence, and claim state. Compare the smallest useful discriminators:

- accepted, disputed, inferred, or missing expectation;
- observable discrepancy and affected Surface, behavior, or work product;
- revision, environment, configuration, data shape, permissions, workload,
  locale, and other material conditions;
- occurrence time, frequency, regression window, and tested-unaffected scope;
- evidence, impact, and workaround; and
- temporal context: report age, last material observation or evidence, last
  substantive triage, and later recurrences, fixes, or related records.

Form candidate groups from symptoms and conditions before presumed cause.
Request missing information only when it could change identity,
classification, current applicability, impact, urgency, or routing. Useful
incomplete reports remain valid intake.

### 3. Assess current applicability and evidence sufficiency

Ask whether the report and its evidence still apply:

- Is the affected revision still deployed, supported, or otherwise relevant?
- Does the cited expectation still apply?
- Is there evidence from a current revision or only a historical one?
- Did a later change, verification, superseding record, or accepted decision
  alter the context?
- Have recent recurrences strengthened current applicability?

Record this assessment only as strongly as the evidence allows. A historical
report may still describe a current Defect, and a recent report may concern an
obsolete revision. Do not introduce a universal age threshold or infer
priority from elapsed time. A standing Process may define local review
triggers.

If available evidence supports the material triage decisions, continue. If a
specific uncertainty could change them, record one bounded question and its
completion condition, then apply [Investigating possible
defects](investigating-possible-defects.md). Examples include whether two
reports describe the same discrepancy under equivalent conditions or whether
an old observation applies to a supported revision. If no plausible result
would change the disposition, do not investigate merely for completeness.

### 4. Decide identity, classification, and impact

Use the narrowest relationship supported by the evidence:

| Finding | Decision |
| --- | --- |
| Same discrepancy under materially equivalent conditions | Consolidate as duplicate when authorized; preserve each occurrence |
| Related symptoms or context; identity uncertain | Relate without marking duplicate |
| Shared behavior with independently actionable differences | Keep separate and record overlap |
| One report contains several independently triageable discrepancies | Split and preserve lineage |
| Previously corrected behavior appears again | Relate as possible regression or recurrence |
| Different cases may share a cause | Keep each report and relate the suspected cause |
| Evidence is insufficient | Defer the identity decision and record what would resolve it |

Choose a canonical report from durable evidence and access considerations, not
age or identifier order alone. Do not move evidence across confidentiality
boundaries to make one report complete.

Classify the current understanding without turning a workflow label into proof:

| Classification | Evidence boundary |
| --- | --- |
| Awaiting investigation | A discrepancy is preserved; whether or where a Defect exists is unresolved |
| Confirmed Defect | An applicable expectation and nonconforming work product or behavior are established |
| Defect hypothesis | Evidence suggests a Defect but does not establish it |
| Established realized-system Defect | Investigation established concrete defective behavior or condition |
| Expectation disputed or indeterminate | Meaning or authority is insufficient |
| Expected behavior or candidate change | Behavior conforms to accepted meaning, or different desired state is requested |
| Insufficient safe evidence | The needed evidence or authority is unavailable |

Summarize affected parties or subjects, consequence, extent, frequency,
duration, recoverability, workaround, evidence confidence, and known-unaffected
scope. Apply the local severity model while keeping priority and scheduling
with their applicable authorities. Route material desired-state or
Architecture gaps through [Requirement-impact
analysis](../control-loop/analyzing-requirement-impact.md); do not invent
missing meaning to finish triage.

### 5. Select the next authorized route

Choose the smallest route supported by evidence and authority:

- finish a named bounded investigation;
- ask the applicable authority to clarify an expectation;
- coordinate with an incident, security, or other governed response;
- link reports to an established Defect;
- create a [Change classified as Bugfix](addressing-defects-through-changes.md)
  when remediation is authorized;
- write a [Change Specification](writing-change-specifications.md) for any
  bounded authorized change;
- retain the report in a named waiting state with a review trigger; or
- close or reject it only when lifecycle authority and evidence support that
  decision.

Record the next action or decision, owner or authority, blocker, and completion
or review trigger. Replace `needs investigation` with the actual question.

### 6. Record and verify the decision

Update each affected report with:

- attributable triage decision and evidence basis;
- identity and relationship disposition;
- current classification and material uncertainty;
- current-applicability assessment when material;
- linked investigation question and bounded conclusion, when used;
- impact and separately governed metadata decisions;
- next route, authority, blocker, and review trigger; and
- preserved occurrence, Provenance, and decision history.

Verify required reciprocal relationships, evidence access boundaries, and
canonical occurrence links. Ensure no automation silently changed priority,
assignment, closure, or corrective scope.

## Batch triage

For a large intake, automation may normalize discriminators, temporal context,
candidate groups, existing relationships, and missing evidence. Each group
remains a candidate and every report receives an item-local decision. Route
only the material unresolved questions to investigation; do not investigate
every report.

Apply urgent-channel checks before bulk consolidation and preserve partial
success. Measure decision quality and recoverability, including time to an
actionable route and the age of unowned or unresolved decisions, rather than
queue reduction alone.

## Exit criteria

Triage can exit when the report and occurrences remain recoverable, urgent and
restricted handling is correct, current applicability and evidence sufficiency
have been considered, identity and classification fit the evidence, material
impact and unknowns are visible, and the next route and authority are explicit.
A deferred decision must carry its bounded question and review trigger.

Triage need not wait for investigation, root cause, correction, verification,
closure, or every related report to reach the same lifecycle state. If triage
recurs, a standing [Process](../processes/process.md) may own entry criteria,
roles, service expectations, age-based review triggers, and handoffs without
redefining Defect Report meaning or decision authority.
