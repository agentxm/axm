---
type: Guide
title: Investigating possible defects
description: Use when a possible Defect leaves a material question that available evidence cannot answer; gather the smallest safe discriminating evidence, including selective reproduction, and return a bounded conclusion without deciding Defect Report lifecycle or corrective authority.
tags: [defect, possible-defect, defect-report, bug, investigation, diagnosis, reproduction, observability, evidence, conclusion]
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
  - id: evidence-authority
    resource: preserving-work-item-evidence-and-authority.md
    title: Preserving evidence and authority in software work items
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
  at: 2026-08-27T14:42:34Z
---

# Investigating possible defects

> **Authority:** This Guide applies the canonical meaning in the [Gen Stack
> vocabulary and relationship model](/glossary.md). When it discusses a
> profile-governed corpus representation, the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) owns that representation.
> This Guide supports action and adds neither semantic authority nor
> profile-conformance rules.

Use this guide when a prompt, alert, feedback record, Defect Report, Evaluation
Result, or possible cross-stack incoherence leaves a material question that
cannot be answered from available evidence. Use [Triaging defect
reports](triaging-defect-reports.md) when the evidence is already sufficient to
decide report identity, classification, disposition, or routing.

## Goal and boundary

Answer one bounded diagnostic question with the safest adequate discriminating
evidence. Preserve the evidence and uncertainty, then return a conclusion no
stronger than the tested scope supports.

Investigation owns selection, gathering, and interpretation of new diagnostic
evidence, including reproduction. It may identify a Defect or Bug, but it does
not decide Defect Report identity, lifecycle, priority, correction, or release.
Those decisions return to triage or their applicable authority.

Investigation is activity, not a Gen Stack work-item role or prescribed
artifact. Perform it in the least durable adequate native surface: the current
conversation, an existing Defect Report or incident record, or another source
system that can preserve the evidence and conclusion. Create a Defect Report
only when a durable case, handoff, or independent lifecycle is needed.

When the activity creates or updates a work item, apply the shared guides for
[evidence and authority](preserving-work-item-evidence-and-authority.md),
[identity and lifecycle](maintaining-work-item-identity-relationships-and-lifecycle.md),
[metadata](managing-work-item-metadata-and-labels.md), and [technical
context](preserving-technical-context.md) instead of repeating their rules
here.

## Representation

Perform the investigation in the least durable adequate native surface. When
a durable record is needed, keep native identity, source, evidence, actor, and
timestamp fields in their owning system. Present residual content in this
order: trigger and sources, bounded question and tested scope, expectation and
discrepancy, material hypotheses, evidence plan and authority, actions and
observations, bounded conclusion, limitations and reopening condition, then
the next decision and its authority. Keep one canonical investigation record
and link its smallest useful conclusion elsewhere instead of copying the full
activity across source systems.

## Guardrails

- **A Signal is not a diagnosis.** A report, alert, or failing test identifies
  something to orient around, not its cause.
- **Current behavior is not expected behavior.** Code, tests, telemetry, and
  history are evidence, not silent Requirement authorities.
- **Negative evidence is bounded.** Failure to reproduce or observe a condition
  does not prove that no Defect exists outside the tested scope.
- **Investigation is not corrective authority.** A finding does not authorize
  priority, implementation, lifecycle transitions, or release.
- **Do not investigate unsafely.** Production mutation, restricted evidence,
  customer data, security testing, and destructive experiments require their
  own authority and safeguards.
- **Stop proportionately.** Establish enough understanding for the bounded
  decision; exhaustive root cause is not a universal completion condition.

## Investigate the possible Defect

### 1. Frame the question and authority

Bind:

- the originating Signal and material source records;
- the smallest behavior, condition, work product, or relationship in question;
- the decision the answer must support;
- the relevant revision, environment, conditions, and time or observation
  window;
- permitted evidence sources and actions; and
- the stopping condition and applicable decision authorities.

Turn a vague request into a discriminating question, for example:

> Does revision `R` violate expectation `E` under conditions `C`, and what
> evidence would distinguish that from an Evaluation, configuration, data, or
> expectation problem?

Preserve each material occurrence's stable identity, observation time,
conditions, safe evidence, and claim state. Keep restricted evidence in its
governed channel. Route current operational impact, possible vulnerabilities,
and other specially governed concerns before ordinary investigation.

### 2. Establish the expectation and discrepancy

State the expected behavior and its basis: an accepted Requirement,
Architecture authority, contract, policy, invariant, quality threshold,
Evaluation Protocol, repository-local implementation contract, intended use,
or an explicitly identified inferred or disputed expectation. State the
smallest observable discrepancy separately.

If the expectation is missing, stale, disputed, or contradicted, expose the
meaning gap and its authority. Do not use current Implementation or tests to
settle desired state silently. If the behavior conforms to accepted meaning
but a different result is wanted, route a candidate change rather than
manufacturing a Defect.

### 3. Develop material hypotheses

Consider only explanations implicated by the evidence. Distinguish among:

- no Defect within the bounded scope;
- an Implementation Defect or Bug;
- a Requirement, Architecture, Evaluation, test, or tooling Defect;
- a configuration, data, dependency, or environment condition;
- an observability gap;
- several contributing Defects; and
- insufficient evidence.

For each material hypothesis, name the observation that would support or
weaken it. When the question is fundamentally a disagreement among Gen Stack
authorities and evidence, apply [Diagnosing and reconciling cross-stack
incoherence](../control-loop/diagnosing-and-reconciling-cross-stack-incoherence.md).

### 4. Choose and gather discriminating evidence

Choose the smallest safe method likely to distinguish the material hypotheses.
Possible sources include a controlled scenario, logs or traces, preserved
runtime state, repository history, static analysis, inspection, comparison
across versions or conditions, an existing Evaluation, configuration or data
inspection, or clarification from the expectation's authority.

For each action, record its authority, exact revision and conditions,
observations, limitations, and the hypotheses it supports, weakens, or leaves
unresolved. Prefer evidence that distinguishes explanations over evidence that
merely accumulates around a favored one.

#### Reproduce selectively

Use reproduction only when a bounded result could distinguish material
hypotheses or change the supported conclusion. Run it only within authorized
systems, data, revisions, and actions, with safeguards and a stopping
condition. Record:

- exact revision, inputs, conditions, and environment;
- result: `reproduced`, `not reproduced`, `inconclusive`, or `blocked`;
- material limitations and untested scope; and
- how the result changed, or did not change, the hypotheses.

Failure to reproduce is negative evidence only for the tested conditions. It
does not prove that an occurrence did not happen or that no Defect exists.

### 5. Interpret and stop proportionately

Keep observations separate from interpretation. Preserve earlier states when
new evidence changes the current understanding. Record affected and
known-unaffected scope, confidence, material limitations, and newly exposed
hypotheses or cross-stack gaps.

Stop when the evidence supports the bounded decision or when the remaining
blocker is explicit. Do not continue toward exhaustive certainty when another
action cannot proportionately change the conclusion or next authorized route.

### 6. Return the bounded conclusion

Return:

- the question, tested scope, revision, conditions, and evidence boundary;
- the supported conclusion and its confidence;
- identified Defects or Bugs and their supporting evidence;
- weakened, eliminated, and remaining hypotheses;
- affected and known-unaffected scope;
- material limitations, residual risk, and reopening condition; and
- the next decision, its authority, or the evidence needed to resume.

Use conclusion language such as `no Defect supported within the tested scope`,
`expectation indeterminate`, `Defect supported`, `Bug identified`, or
`inconclusive`. These are evidence conclusions, not Defect Report identity or
lifecycle decisions. Return those decisions to triage. A separately authorized
Bug correction proceeds through a linked [Bugfix
Specification](writing-bugfix-specifications.md); a possible desired-state
change proceeds through [Requirement-impact
analysis](../control-loop/analyzing-requirement-impact.md).

When authorized to update a native record, write only the smallest useful
conclusion and canonical evidence links, then read back the persisted result.
Do not copy the complete investigation into every source system.

## Compact working form

```text
Trigger and sources:
Question, scope, revision, and conditions:
Expectation and observable discrepancy:
Material hypotheses:
Evidence plan and authority:
Actions, observations, and limitations:
Conclusion, confidence, and bounded scope:
Remaining unknowns and reopening condition:
Next decision and authority:
```

## Exit criteria

The investigation can exit when its sources remain traceable, the question and
evidence boundary are explicit, observations remain distinguishable from
interpretation, the conclusion fits the evidence, and the next decision or
blocker is recoverable. Completion does not require exhaustive root cause,
correction authorization, an implemented fix, verification, or closure of any
related record.

If investigation recurs, a standing [Process](../processes/process.md) may own
entry criteria, roles, permitted actions, handoffs, service expectations, and
review triggers. It does not redefine Defect, Bug, work-item lifecycle, or
corrective authority.
