---
type: Guide
title: Investigating possible defects
description: Use when a prompt, alert, feedback record, Defect Report, Evaluation Result, or possible cross-stack incoherence may indicate a Defect; gather discriminating evidence, establish the narrowest supported disposition, and route or synchronize resulting work without presuming a Bug or corrective authority.
tags: [defect, possible-defect, defect-report, bug, investigation, diagnosis, observability, feedback, evaluation, drift, evidence, disposition, bugfix-specification]
status: draft
sources:
  - id: defect-explainer
    resource: failures-defects-and-defect-reports.md
    title: Failures, defects, and defect reports
  - id: defect-intake
    resource: recording-defect-reports.md
    title: Recording defect reports
  - id: defect-triage
    resource: triaging-defect-reports.md
    title: Triaging defect reports
  - id: bugs-and-bugfixes
    resource: bugs-and-bugfix-specifications.md
    title: Bugs and bugfix specifications
  - id: evidence-authority
    resource: preserving-work-item-evidence-and-authority.md
    title: Preserving evidence and authority in software work items
  - id: work-item-lifecycle
    resource: maintaining-work-item-identity-relationships-and-lifecycle.md
    title: Maintaining work-item identity, relationships, and lifecycle
  - id: cross-stack-diagnosis
    resource: ../control-loop/diagnosing-and-reconciling-cross-stack-incoherence.md
    title: Diagnosing and reconciling cross-stack incoherence
  - id: evaluation-evidence
    resource: ../evaluations/evaluation-as-bounded-evidence.md
    title: Evaluation as bounded evidence
  - id: process
    resource: ../processes/process.md
    title: Process
generated:
  by: codex/gpt-5
  at: 2026-08-26T23:47:25Z
---

# Investigating possible defects

> **Authority:** This Guide applies the canonical meaning in the [Gen Stack
> vocabulary and relationship model](/glossary.md). When it discusses a
> profile-governed corpus representation, the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) owns that representation.
> This Guide supports action and adds neither semantic authority nor
> profile-conformance rules.

Use this guide when a Signal suggests that the system or a work product may
contain a Defect and additional evidence is needed before choosing a
disposition or corrective route.

The Signal may originate from:

- an explicit investigation request or prompt;
- an alert, error log, trace, metric, or other operational Observation;
- customer, user, maintainer, or support feedback;
- a Defect Report or related work item;
- an incident or recurring operational symptom;
- an Evaluation Result, test failure, review, or static finding; or
- possible drift or incoherence among Intent, Requirements, Architecture,
  Implementation, Evaluations, and operation.

Use [Triaging defect reports](triaging-defect-reports.md) when the current
evidence is sufficient to decide relationships and routing. Use this guide
when a material question must be answered by gathering or interpreting
additional evidence.

## Goal

Establish the narrowest defensible disposition of the possible Defect,
preserve the evidence and uncertainty supporting it, and route the resulting
work to its proper authority and artifact.

A successful investigation:

- preserves every material originating Signal and occurrence;
- states the question, scope, applicable expectation, and evidence boundary;
- distinguishes observations, inferences, hypotheses, findings, and decisions;
- tests competing explanations without presuming which Gen Stack layer is
  wrong;
- identifies a Defect or Bug only to the degree supported by evidence;
- records affected and known-unaffected scope without inventing priority;
- creates or updates the appropriate durable records;
- names the next authorized action, owner or authority, and review trigger;
- synchronizes affected source systems when authorized; and
- closes honestly as identified, unsupported for the bounded scope, deferred,
  blocked, escalated, or unresolved.

The desired outcome is not necessarily a Bugfix Specification. `No Defect
supported`, `expectation unresolved`, and `insufficient evidence` are
legitimate outcomes when their scope and evidence are explicit.

## Representation

Keep the investigation in the least durable adequate native surface:

- the current conversation for bounded, transient analysis;
- an existing Defect Report when it already owns the case;
- a new Defect Report when a durable case, handoff, or independently managed
  lifecycle is needed;
- an incident record while live operational response governs the work;
- a repository-native investigation or diagnostic work item when the host
  distinguishes it; or
- the source system when it can preserve the evidence, disposition, authority,
  and relationships faithfully.

Do not create a second investigation ledger merely to normalize different
systems. Link peer records and designate canonical ownership for each fact.

## Apply the common work-item guides

Use the shared guides for:

- [evidence and authority](preserving-work-item-evidence-and-authority.md),
  including provenance, claim states, unavailable evidence, safe channels,
  and decision attribution;
- [identity, relationships, and
  lifecycle](maintaining-work-item-identity-relationships-and-lifecycle.md),
  including duplicate, split, regression, resolution, verification, closure,
  and reopening;
- [metadata and labels](managing-work-item-metadata-and-labels.md), including
  severity, priority, assignment, workflow state, and external mutation; and
- [preserving technical
  context](preserving-design-and-delivery-context.md) when the investigation
  develops technical reasoning that later work must retain.

## Guardrails

- **A Signal is not a diagnosis.** An alert, failing test, report, or prompt
  indicates that something may require attention; it does not identify the
  cause.
- **Current behavior is not automatically expected behavior.** Code,
  configuration, tests, telemetry, and historical behavior are evidence, not
  silent Requirement authorities.
- **Investigation is not corrective authorization.** Identifying a Bug does
  not authorize correction or require immediate creation of a Bugfix
  Specification.
- **Do not require exhaustive root cause.** Establish enough causal
  understanding for the current disposition and next decision. Preserve
  additional contributing hypotheses when they remain material.
- **Negative evidence is bounded.** Failure to reproduce does not prove that no
  Defect exists outside the tested conditions.
- **Impact is not priority.** Investigation may establish consequence and
  scope; priority, scheduling, and assignment remain separate decisions.
- **Do not investigate unsafely.** Production mutation, restricted evidence
  access, security testing, customer-data access, and destructive experiments
  require their own authority and safeguards.
- **Preserve history.** Later findings update the current understanding; they
  do not rewrite what was originally observed or believed.

## Investigate the possible Defect

### 1. Bind the Signal, question, and authority

Identify:

- what triggered the investigation;
- the smallest behavior, condition, work product, or relationship in question;
- the decision the investigation must support;
- the applicable time, revision, environment, or operating window;
- the permitted evidence sources and actions; and
- who may decide classification, correction, lifecycle transitions, and
  external updates.

Turn a vague request such as `investigate this error` into a bounded question:

> Does Implementation revision `R` violate expectation `E` under conditions
> `C`, and what evidence would distinguish that from an Evaluation,
> configuration, data, or expectation problem?

If the work needs a durable identity, handoff, or continuing evidence history
and none exists, create or link a Defect Report. Do not create one merely to
memorialize a transient analysis whose source already preserves everything
needed.

### 2. Preserve the originating Signals and occurrences

For each material source, retain:

- source system and record type;
- stable identifier and controlled-access link;
- observation or report time;
- reporter, evaluator, or issuing role when relevant;
- affected revision, environment, configuration, and conditions;
- safe correlation or occurrence identifiers;
- original evidence and its availability; and
- whether each claim was observed, reported, measured, inferred, or
  hypothesized.

Keep restricted evidence in its governed channel. A public or broadly visible
work item should contain only a safe synopsis and controlled reference.

If the Signal indicates current operational impact, a possible security
vulnerability, or another specially governed concern, activate the appropriate
incident, security, safety, legal, or compliance route before continuing
ordinary investigation.

### 3. Establish the expectation and discrepancy

State the expected behavior and its basis:

- accepted Requirement or acceptance criterion;
- Architecture responsibility, boundary, or decision;
- contract, policy, invariant, or quality threshold;
- Evaluation Protocol or repository-local implementation contract;
- intended use; or
- an explicitly identified inferred or disputed expectation.

Then state the smallest observable discrepancy separately.

If the expectation is missing, disputed, stale, or contradicted, do not use
the Implementation or test suite to settle it silently. Record the meaning gap
and the authority needed to resolve it.

If the observed behavior conforms to accepted meaning but a stakeholder wants
a different result, preserve the originating Signal and route a candidate
change rather than manufacturing a Defect.

### 4. Develop competing hypotheses

Consider only explanations implicated by the evidence. Possible hypotheses
include:

| Possible explanation | Diagnostic question |
| --- | --- |
| No Defect | Are the observation and accepted expectation actually consistent? |
| Implementation Defect or Bug | Does realized behavior or condition fail otherwise coherent accepted meaning? |
| Requirement Defect | Is the obligation missing, ambiguous, contradictory, misplaced, or obsolete? |
| Architecture Defect | Is a responsibility, boundary, interaction, decision, or response incorrect or absent? |
| Evaluation Defect | Is the criterion, target, method, threshold, oracle, execution binding, or evidence interpretation wrong? |
| Test or tooling Defect | Does the diagnostic or implementation-local test fail to measure what it claims? |
| Configuration, data, dependency, or environment condition | Does the behavior depend on a condition outside the presumed system state? |
| Observability gap | Is the available telemetry incomplete, misleading, incorrectly attributed, or too weak to discriminate? |
| Multiple contributing Defects | Do several work products or conditions jointly produce or sustain the behavior? |
| Insufficient evidence | Can the current evidence distinguish any of the above? |

When the possible Defect is fundamentally a disagreement among Gen Stack
authorities and evidence, apply [Diagnosing and reconciling cross-stack
incoherence](../control-loop/diagnosing-and-reconciling-cross-stack-incoherence.md).
Do not duplicate its full reconciliation procedure here.

### 5. Choose the smallest discriminating evidence

For each material hypothesis, state:

- what observation would support or weaken it;
- the exact revision, conditions, inputs, and environment required;
- the safest adequate evidence-gathering method;
- the expected evidentiary strength and important blind spots; and
- the stopping condition.

Evidence may come from:

- a minimal reproducer or controlled scenario;
- logs, traces, metrics, recordings, or preserved runtime state;
- repository history, static analysis, inspection, or review;
- comparison across affected and unaffected versions or conditions;
- an existing Evaluation Protocol, Execution, and Result;
- a bounded diagnostic experiment;
- configuration, dependency, or data inspection; or
- clarification from the authority that owns the expectation.

Prefer evidence that distinguishes among hypotheses over evidence that merely
accumulates around the favored explanation.

Telemetry alone is an Observation, not automatically an Evaluation. A passing
test establishes only its bounded claim, revision, inputs, and conditions. A
failed Evaluation does not identify which artifact must change.

### 6. Gather and interpret evidence incrementally

Record:

- the action taken and its authority;
- the exact conditions and revision;
- observations and measurements;
- which hypotheses the evidence supports, weakens, or leaves unresolved;
- eliminated conditions and their evidence;
- affected and known-unaffected scope;
- confidence and material limitations; and
- newly exposed hypotheses or cross-stack gaps.

Keep evidence separate from interpretation. When new evidence contradicts an
earlier conclusion, preserve both states and record why the current
interpretation changed.

Stop when the investigation has enough evidence for the bounded decision. Do
not continue toward exhaustive certainty when additional work cannot change
the disposition or next authorized route proportionately.

### 7. Determine the current disposition

Choose the narrowest supported disposition:

| Disposition | Required outcome |
| --- | --- |
| No Defect supported for the bounded scope | Record the tested scope, evidence, limitations, and reopening condition |
| Expected behavior; candidate desired-state change | Preserve the Signal and route a separately authorized Change Specification or decision |
| Expectation disputed or indeterminate | Route clarification to the Requirement, Architecture, policy, contract, or domain authority |
| Confirmed Defect without an identified Bug | Record the defective work product, applicable expectation, evidence, and owning correction route |
| Identified Bug | Record the concrete defective behavior or condition, evidence, affected scope, related Defects, and supporting Defect Reports |
| Duplicate, overlap, recurrence, or related case | Apply the triage and identity guidance while preserving every occurrence |
| Operational, security, safety, or compliance escalation | Link the governed response record without erasing the investigation provenance |
| Inconclusive or unavailable evidence | Record remaining hypotheses, the discriminating evidence needed, owner, blocker, and review trigger |

A disposition may identify several related Defects. Do not force a many-to-many
diagnostic network into one report, one Bug, or one correction.

### 8. Select the corrective or decision route

Route according to both evidence and authority:

- If a Bug is identified and correction is authorized, create and link a
  separate [Bugfix Specification](writing-bugfix-specifications.md).
- If a Bug is identified but correction is not authorized, preserve the
  diagnosis and request or record the applicable correct, defer, compensate,
  mitigate, or accept-risk decision.
- If a non-Bug Defect belongs to a Requirement, Architecture, Evaluation,
  test, documentation, or other work product, route correction to that
  artifact's owner and applicable change authority.
- If the desired behavior itself may change, apply [Requirement-impact
  analysis](../control-loop/analyzing-requirement-impact.md) before specifying
  a candidate change.
- If no additional action is justified, record the bounded conclusion and
  reopening condition.
- If investigation remains blocked, name the blocked decision and the evidence
  or authority required to resume.

Creating delivery work must not silently close, retitle, or replace the
originating Defect Reports.

### 9. Synchronize the affected records

When explicitly or standingly authorized, update each affected native system
with the smallest useful result:

- current disposition and evidence basis;
- safe diagnosis synopsis;
- canonical investigation or Defect Report link;
- identified Bug and Bugfix Specification links;
- incident, Evaluation, feedback, or source relationships;
- next owner or decision authority; and
- residual uncertainty or reopening trigger.

Use native relationships and fields when their semantics match. Do not copy
the complete investigation into every source system.

External mutation authority is separate from investigation authority. After
creating, commenting on, relating, resolving, or closing an external record,
read it back and verify the persisted state and links.

### 10. Close the investigation honestly

Record:

- final or current disposition;
- evidence scope and confidence;
- identified Defects and Bugs;
- remaining hypotheses and unknowns;
- affected and known-unaffected scope;
- decision and applicable authority;
- resulting work and relationships;
- source-system updates completed, failed, or awaiting authority;
- residual risk; and
- reopening or review condition.

Keep these lifecycle events distinct:

- investigation completion;
- Defect Report disposition;
- Defect Report closure;
- correction authorization;
- Bugfix Specification creation and delivery;
- implementation of a correction;
- verification; and
- closure of related source or incident records.

One event does not silently cause the others. A Defect Report may close after
a supported disposition, remain open through correction verification, or
follow another local policy. Creating a Bugfix Specification alone does not
determine that choice.

## Compact working form

```text
Trigger and source records:
Investigation question and affected scope:
Applicable expectation and authority:
Observed discrepancy:
Material hypotheses:
Discriminating evidence plan:
Actions and evidence gathered:
Findings, eliminated conditions, and confidence:
Affected and known-unaffected scope:
Disposition:
Identified Defects and Bugs:
Impact and residual risk:
Next action or decision:
Owner or applicable authority:
Related work and canonical links:
Source-system updates:
Unknowns, blockers, and review trigger:
```

## Completion check

The investigation is complete for its bounded purpose when:

- material originating Signals and occurrences remain traceable;
- the question, expectation, revision, conditions, and evidence boundary are
  explicit;
- observations, hypotheses, findings, and decisions remain distinguishable;
- the disposition is no stronger than the evidence supports;
- affected and known-unaffected scope and material impact are visible;
- identified Defects and Bugs are linked to their supporting reports and
  evidence;
- the next authorized action or decision has an owner, authority, and trigger;
- source-system synchronization is verified or explicitly pending; and
- residual uncertainty and reopening conditions are recoverable.

Completion does not require an exhaustive root cause, authorized correction,
implemented fix, successful verification, or closure of every related record.

## Standing Process considerations

When possible-defect investigation recurs across people, systems, or
automation, define a standing [Process](../processes/process.md) for the
durable coordination rules:

- triggering events and intake channels;
- criteria for creating a durable investigation or Defect Report;
- roles, decision authorities, and handoffs;
- urgent and restricted escalation;
- permitted diagnostic and external mutations;
- systems of record and canonical relationship ownership;
- source-system synchronization and retry behavior;
- completion, closure, and reopening policies;
- service expectations and review triggers; and
- outcome, quality, flow, safety, and recurrence measures.

One Process enactment should end when each triggering Signal has a recorded
disposition, its evidence and relationships remain recoverable, the next route
has an owner or decision authority, and required source systems are
synchronized or explicitly awaiting synchronization.

The Process coordinates the work. It does not redefine Defect, Bug, Defect
Report, Bugfix Specification, Requirement authority, or verification.
