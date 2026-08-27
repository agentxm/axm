---
type: Guide
title: Triaging defect reports
description: Use when one or more Defect Reports need an evidence-backed disposition and next route; preserve occurrences and uncertainty while relating, consolidating, splitting, escalating, or routing cases without inventing diagnosis, priority, or corrective authority.
tags: [defect-report, triage, duplicate, overlap, merge, split, classification, routing, severity, priority, investigation]
status: draft
sources:
  - id: defect-explainer
    resource: failures-defects-and-defect-reports.md
    title: Failures, defects, and defect reports
  - id: recording-defects
    resource: recording-defect-reports.md
    title: Recording defect reports
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
  by: codex/gpt-5.6
  at: 2026-08-26T23:34:25Z
---

# Triaging defect reports

> **Authority:** This Guide applies the canonical meaning in the [Gen Stack
> vocabulary and relationship model](/glossary.md). When it authors a
> profile-governed corpus concept, the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) owns its required
> representation. This Guide supports action and adds neither semantic authority
> nor profile-conformance rules.

Use this guide when one or more Defect Reports need a current disposition and
an authorized next route. Triage orients the available Signals and evidence; it
does not require the triager to diagnose a Bug, choose a correction, or promise
delivery.

For safe intake before triage, use [Recording defect
reports](recording-defect-reports.md). For the distinction among a failure,
Defect Report, Defect, Bug, Bugfix Specification, and incident, read [Failures,
defects, and defect reports](failures-defects-and-defect-reports.md).

## Goal

Each report leaves triage with a recoverable, evidence-backed disposition and
next route. Specifically:

- every material occurrence remains traceable, including occurrences later
  consolidated under a canonical report;
- duplicate, overlap, split, and relationship decisions state their basis and
  preserve uncertainty where identity is unresolved;
- urgent operational or security concerns reach the appropriate channel;
- current understanding distinguishes observation, confirmed Defect, Bug
  hypothesis, identified Bug, and disputed or absent expectation;
- impact is visible without silently assigning priority, ownership, schedule,
  root cause, or corrective scope;
- the next authorized action, owner or decision authority, and blocking
  evidence are explicit; and
- triage can be revisited when new evidence changes identity, impact,
  classification, or route.

The desired outcome is not an empty queue. It is a queue whose cases are safely
preserved, related, understood to the degree evidence permits, and routed to the
right decision or investigation.

## Apply the common work-item guides

This guide owns the triage comparison, disposition, and next-route decision.
Use the shared guides for:

- [evidence and authority](preserving-work-item-evidence-and-authority.md),
  including claim states, occurrence inventories, safe channels, unknowns, and
  decision attribution;
- [identity, relationships, and
  lifecycle](maintaining-work-item-identity-relationships-and-lifecycle.md),
  including duplicate, merge, split, regression, resolution, verification,
  closure, and reopening semantics;
- [metadata and labels](managing-work-item-metadata-and-labels.md), including
  type, workflow state, severity, priority, assignment, and authorized external
  mutation; and
- [titles and summaries](titling-and-summarizing-work-items.md) when triage
  reveals a clearer discriminator.

## Guardrails

- **Preserve before consolidating.** Capture each material occurrence and its
  provenance before relating or consolidating reports.
- **Similarity is orientation evidence, not identity proof.** Shared symptoms,
  components, traces, reporters, or time windows may suggest a relationship;
  they do not by themselves prove a duplicate or common cause.
- **Triage is not diagnosis.** Keep observations, inferences, hypotheses,
  confirmed Defects, and identified Bugs distinguishable.
- **Relationship is not replacement.** Link overlap, dependency, regression,
  common context, or suspected common cause without forcing reports into a
  duplicate relationship.
- **Impact is not priority.** Record consequence and scope as evidence; mutate
  priority, assignment, and delivery timing only through their applicable
  authority.
- **Routing is not corrective authorization.** An investigation, incident,
  Change Specification, or Bugfix Specification has its own scope and
  authority.
- **Unknown is a valid disposition component.** Record the evidence or decision
  needed instead of manufacturing confidence.
- **Respect evidence boundaries.** Move security-sensitive, personal, private,
  or otherwise restricted evidence to an approved channel and leave only a safe
  synopsis and controlled reference in a public report.

## Triage the reports

### 1. Bind the triage scope and authority

Identify the reports, time window, product or service boundary, and triage
authority. Determine which decisions the triager may make directly and which
require a product owner, incident commander, security role, domain authority,
maintainer, or other named decision-maker.

Do not infer that access to the tracker grants authority to change priority,
close a report, disclose restricted evidence, accept a Requirement, identify a
Bug, or authorize a correction. When a standing [Process](../processes/process.md)
governs intake or triage, apply its entry criteria, roles, states, and escalation
rules without transferring semantic authority to the workflow.

### 2. Route urgent or restricted cases first

Before comparing identity, check for cases that require an immediate channel:

- current or imminent operational impact that meets the local response
  threshold routes to an [operational incident
  record](recording-operational-incidents.md);
- a possible security vulnerability follows the organization's private
  disclosure and response path rather than an ordinary public issue;
- unsafe evidence moves to an approved controlled location while the report
  retains a safe synopsis and reference; and
- a material legal, safety, compliance, or data-integrity concern reaches its
  designated authority.

Keep the Defect Report as provenance when another record coordinates the live
response. Escalation changes the handling route; it does not erase the report
or prove a Bug.

### 3. Establish a comparable evidence basis

For each report, recover the smallest set of discriminators needed to compare
cases:

- the accepted, disputed, inferred, or missing expectation;
- the smallest observable discrepancy;
- affected Surface, behavior, work product, or quality characteristic;
- relevant environment, version or revision, configuration, data shape,
  permissions, timing, workload, and locale;
- occurrence or discovery time, frequency, and known regression window;
- safely retained evidence and stable occurrence identifiers;
- known impact, workaround, and affected or tested-unaffected scope; and
- current claim state: observed, reported, measured, inferred, hypothesized,
  confirmed, or unknown.

Request missing information only when it can materially change identity,
impact, classification, urgency, or route. A useful but incomplete occurrence
must not disappear merely because ideal reproduction steps are unavailable.

### 4. Decide identity and relationships

Compare the observable case before comparing presumed cause. Use the narrowest
relationship supported by the evidence.

| Finding | Disposition | Required preservation |
| --- | --- | --- |
| Same observable discrepancy under materially equivalent conditions | Consolidate as a duplicate when the identity decision is authorized | Preserve the occurrence, source, evidence, and bidirectional canonical relationship |
| Related symptoms or context, but identity remains uncertain | Relate the reports; do not mark duplicate | State the suspected relationship, evidence, and uncertainty |
| Partly shared behavior with independently actionable differences | Keep separate and record overlap | Name the shared and distinct scope and any coordination needed |
| One report contains multiple independently triageable discrepancies | Split into distinct reports | Preserve the source report and lineage from each new report |
| A previously corrected behavior recurs | Relate as a possible regression or recurrence | Preserve the new occurrence, affected version, and prior verification boundary |
| Reports may share a cause but describe different observable cases | Relate as suspected common cause | Keep each Defect Report; link a later identified Bug or investigation |
| Evidence is insufficient to choose | Defer the identity decision | Record the discriminator, evidence, or authority needed to resume |

When consolidating, choose a canonical report for durable reasons such as the
clearest expectation and discrepancy, strongest evidence, safest and most
accessible provenance, established discussion, or required external identity.
Age or identifier order alone is not a sufficient rule. Move no claim or
evidence across confidentiality boundaries merely to make one report complete.

### 5. Classify the current understanding

Record what the evidence supports now, without turning the workflow label into
the conclusion:

- **Defect Report awaiting investigation:** a discrepancy is preserved, but
  whether a Defect exists or where it lies remains unresolved.
- **Confirmed Defect:** an accepted expectation and a nonconforming work
  product or behavior are established, while cause may still be unknown.
- **Bug hypothesis:** evidence suggests a concrete software cause, but
  investigation has not identified it with sufficient confidence.
- **Identified Bug:** investigation has identified a concrete software problem
  that can explain one or more reports; link the reports without replacing
  their provenance.
- **Expectation disputed or indeterminate:** the expected result lacks the
  authority, clarity, completeness, or agreement needed for classification.
- **Expected behavior or candidate change:** the observed behavior conforms to
  the accepted expectation, or the request is for a different desired state;
  preserve the originating Signal and route the proposed change separately.
- **Insufficient safe evidence:** the case cannot yet be classified within the
  available evidence boundary; record what is needed and who may provide or
  decide it.

If classification depends on reducing uncertainty, create or link a bounded
investigation with an explicit question and completion condition. An
investigation result may update the disposition; it does not silently rewrite
what was originally observed.

### 6. Surface cross-stack impact and meaning gaps

Assess whether the report exposes a missing, underdeveloped, misplaced,
disputed, or contradicted Requirement, Surface, C4 structure, Evaluation route,
or operational understanding. Use [Analyzing Requirement
impact](../control-loop/analyzing-requirement-impact.md) and, when needed, the
shared [candidate Architecture and Requirements
guide](../architecture/developing-candidate-architecture-and-requirements.md).

Record each material gap with its evidence, impact, candidate options or
correction, recommendation, applicable authority, and blocking status. Do not
invent the missing meaning in order to finish triage. If evidence supports an
actual candidate Requirement addition, revision, retirement, replacement,
split, or merge, route it through a separately authorized Change or Bugfix
Specification that applies [Specifying Requirement
changes](specifying-requirement-changes.md).

### 7. Assess impact without smuggling priority

Summarize who or what is affected, consequence, extent, frequency, duration,
recoverability, workaround, and evidence confidence. Include the scope tested
and known not to be affected when it changes interpretation.

Use this evidence to support the local severity model. Keep severity distinct
from priority, assignment, target date, service commitment, and delivery
sequence. If one of those decisions is required, name its authority and route
it rather than substituting the triager's judgment.

### 8. Select the next authorized route

Choose the smallest next route that can resolve the material uncertainty or
advance an authorized correction:

- gather a specific missing discriminator or safe evidence;
- run a bounded investigation into identity, expectation, cause, scope, or
  impact;
- ask the applicable authority to clarify or accept an expectation;
- coordinate with an active operational incident or security response;
- link one or more Defect Reports to an identified Bug;
- write a [Bugfix Specification](writing-bugfix-specifications.md) when a Bug
  is identified and corrective change is authorized;
- write a [Change Specification](writing-change-specifications.md) for an
  authorized desired-state change that is not a correction of an identified
  Bug;
- retain the report in a named waiting state with a review trigger; or
- close or reject it only when the applicable lifecycle authority and evidence
  support that decision.

Record the next action or decision, responsible owner or authority, blocking
condition, and completion or review trigger. Avoid vague outcomes such as
“needs investigation” when the actual question can be named.

### 9. Record and verify the triage decision

Update each affected report with:

- triage date and attributable decision-maker or role;
- disposition and supporting evidence;
- canonical, duplicate, overlap, split, regression, incident, investigation,
  Bug, or Specification relationships;
- preserved occurrence and provenance references;
- current classification and material uncertainty;
- impact assessment and any separately governed metadata decision;
- next route, owner or authority, blocker, and review trigger; and
- decision history when the disposition supersedes an earlier conclusion.

Verify that relationships are reciprocal where the host requires both sides,
restricted evidence remains restricted, canonical reports retain access to the
distinct occurrences, and no automation silently changed priority, assignment,
closure, or corrective scope.

## Triage batches without losing item-local decisions

For a large intake, use automation to orient humans: normalize candidate
discriminators, group similar observations, find existing relationships, and
surface missing evidence. Treat every group or similarity score as a candidate,
not a merge decision.

Apply urgent-channel checks before bulk consolidation. Then record a distinct
disposition on every report, including those in the same cluster. Preserve
partial success: one unsafe, ambiguous, or blocked item must not invalidate
valid decisions on other reports, and one successful relationship must not be
presented as evidence that the whole batch is resolved.

Measure the process by decision quality and recoverability, not merely queue
reduction. Useful signals include time to urgent routing, time to an actionable
next route, reversals caused by lost evidence or premature consolidation,
unowned or indefinitely waiting cases, and the age of unresolved identity or
authority decisions.

## Completion check

Triage is complete for a report when:

- the report and every material occurrence remain recoverable;
- urgent and restricted handling has been applied where needed;
- its identity or relationship disposition and evidence basis are explicit;
- its current classification and unknowns are distinguishable;
- material impact and cross-stack gaps are visible;
- the next authorized route, owner or authority, and trigger are recorded; and
- the decision can be revisited without reconstructing lost provenance.

Triage need not wait for root cause, a chosen correction, implementation,
verification, closure, or every related report to reach the same lifecycle
state.

## Standing Process considerations

If triage recurs, encode only the durable coordination rules in a standing
[Process](../processes/process.md): entry criteria, roles, decision authorities,
states, escalation channels, review triggers, and observable outputs. Keep
Defect Report meaning, relationship semantics, Requirement authority, and
corrective authorization in their canonical owners rather than redefining them
inside the Process.
