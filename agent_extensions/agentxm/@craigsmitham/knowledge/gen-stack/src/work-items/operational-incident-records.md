---
type: Explanation
title: Operational incident records
description: How operational impact, service state, response state, and understanding evolve independently; how one incident identity coordinates several response surfaces; and why impact end, restoration, recovery, closure, and follow-up remain distinct.
tags: [incident, incident-record, outage, service-degradation, incident-management, operations, reliability, mitigation, restoration, recovery, closure, incident-command, communication, work-item]
status: draft
sources:
  - id: atlassian-incident-response
    resource: https://www.atlassian.com/incident-management/handbook/incident-response
    title: Atlassian — How we respond to an incident
  - id: google-sre-incidents
    resource: https://sre.google/sre-book/managing-incidents/
    title: Google SRE — Managing Incidents
  - id: microsoft-incident-management
    resource: https://learn.microsoft.com/en-us/azure/well-architected/design-guides/incident-management
    title: Microsoft Azure Well-Architected Framework — Develop an incident management practice
  - id: iso-23612
    resource: https://www.iso.org/standard/87495.html
    title: ISO — ISO/IEC/IEEE 23612:2026 Incident management
  - id: iso-25011
    resource: https://www.iso.org/standard/35735.html
    title: ISO — ISO/IEC TS 25011:2017 Service quality models
  - id: nist-800-61r3
    resource: https://csrc.nist.gov/pubs/sp/800/61/r3/final
    title: NIST SP 800-61 Rev. 3 — Incident response recommendations and considerations
generated:
  by: codex/gpt-5.6
  at: 2026-08-27T03:09:27Z
---

# Operational incident records

> **Authority:** The [Gen Stack vocabulary and relationship
> model](/glossary.md) is authoritative for canonical terms and relationships.
> This Explanation develops understanding without redefining them. When it
> discusses a profile-governed corpus representation, the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) governs that representation.
> This document adds neither semantic authority nor profile-conformance rules.

An **operational incident** is an unplanned occurrence that disrupts, reduces,
or imminently threatens the quality of a service and warrants coordinated
response. Its **incident record** is the living work artifact that preserves
the response's current state, control, evidence, chronology, and transition
out of emergency work.

The occurrence and the record are different things. Declaring an incident
does not prove a root cause, establish that a software defect exists, or
determine which permanent change should follow. It establishes that the
available impact or threat warrants coordinated response under local policy.

ISO/IEC/IEEE 23612 defines a generic incident-management process and
supporting documentation across development and operations.[^iso-23612]
Qualifying this concept as an **operational** incident keeps its service-impact
and coordinated-response purpose distinct from the broader meanings of
*incident* used in testing, security, support, and project work.

## One incident, several moving states

Incident tools often expose one status field, but an incident changes along
several dimensions that do not advance together:

| Dimension | What it asks | Examples of evidence, not universal labels |
| --- | --- | --- |
| Impact | What harm or imminent threat exists now? | Threatened, expanding, reduced, ended |
| Service | What level of service is actually available? | Unavailable, degraded, mitigated, within objectives, fully recovered |
| Response | What coordinated work is active? | Declared, mobilizing, active, monitoring, handed off, closed |
| Understanding | What does the evidence support? | Observation, hypothesis, supported finding, confirmed cause |
| Follow-up | What work continues after emergency response? | Review required, recovery owned, defect linked, risk accepted |

A workaround can end visible impact while the service remains degraded. A
service can operate within its objectives while cleanup or data recovery
continues. A response can close before a cause is known, and a confirmed cause
does not prove that restoration succeeded. Preserve these distinctions instead
of asking one `resolved` label to carry them all.

## Lifecycle and completion

These moments answer different questions:

| Moment | Meaning |
| --- | --- |
| Mitigation or containment | An action limits harm, blast radius, or further change |
| Impact end | Current or imminent stakeholder harm has ended under the local definition |
| Restoration | The service again meets the stated operating or service objectives |
| Recovery | Required functions, data, dependencies, and operating conditions have been re-established to the accepted state |
| Closure | The authorized owner ends coordinated response after the local exit conditions are satisfied |

Local processes may close emergency response at impact end or require fuller
restoration and validation.[^atlassian-incident-response]
[^microsoft-incident-management] The portable rule is to preserve the chosen
boundary, observable conditions, evidence window, authority, residual state,
and independently owned follow-up. A mitigation, deployment, or cleared alert
is not proof that the boundary was met, and closure need not wait for root cause
or permanent correction.

The [recording guide's completion
criteria](recording-operational-incidents.md#completion-criteria) apply these
distinctions. ISO/IEC TS 25011 supplies a service-quality model for acceptance
criteria; a tracker status remains only a projection.[^iso-25011]

## The response lifecycle is a network

The response is oriented toward limiting harm and restoring an acceptable
service, but the record also preserves the branches that continue afterward:

```text
Alert, report, observation, or predicted threat
                    │
                    ▼
          assess impact and declare
                    │
                    ▼
      coordinate, investigate, and communicate
          ┌─────────┼──────────┐
          ▼         ▼          ▼
       contain   mitigate   gather evidence
          └─────────┼──────────┘
                    ▼
       monitor against explicit exit criteria
                    │
          ┌─────────┴──────────┐
          ▼                    ▼
  impact ended          impact persists or returns
          │                    │
          ▼                    └── revise, escalate, or reopen
 restore, recover, and close under local policy
          │
          ├── post-incident review and learning
          ├── defect, problem, or corrective change
          └── cleanup, data recovery, or accepted residual risk
```

Several incidents may arise from one wider event, and one long incident may
need subordinate workstreams or child incidents. A recurring symptom may link
to one problem or defect without erasing the distinct impact, response, and
chronology of each occurrence.

## Command is a responsibility, not a job title

Coordinated response needs one recognized authority for the overall incident
state. That role may be called incident commander, incident manager, or
incident lead. It owns coordination and delegates technical work,
communication, planning, and record-keeping as the incident warrants.

Google separates command, operational work, communication, and planning, then
requires command handoff to be explicit and acknowledged.[^google-sre-incidents]
Small incidents can combine roles; larger incidents can split them or create
subordinate workstreams. The portable requirement is that current authority,
delegated ownership, and handoffs remain visible—not that every organization
use one role taxonomy.

The record should preserve decisions and authority without turning command
into permission for ungoverned change. Local access, approval, security,
safety, and change-control rules continue to apply unless the governing
incident process explicitly authorizes an exception.

## One incident identity, several response surfaces

An effective response commonly uses several purpose-specific surfaces:

| Surface | Primary job |
| --- | --- |
| Incident record or state document | Authoritative current state, ownership, objectives, decisions, and chronology |
| Command channel or bridge | Fast responder coordination |
| Dashboards, logs, traces, and working notes | Technical evidence and investigation |
| Internal and external status communication | Audience-appropriate impact and response updates |
| Review and corrective-work records | Learning, recovery, and independently governed follow-up |

Google and Atlassian both use combinations of live documents, chat, tracking,
technical evidence, and stakeholder communication rather than forcing every
job into one interface.[^google-sre-incidents][^atlassian-incident-response]
The important invariant is one stable incident identity and one recognized
current state, with the other surfaces linked and reconciled. A chat transcript
is valuable chronology, but it should not force someone joining the response
to reconstruct the current situation message by message.

## Neighboring concepts and response regimes

| Concept | What it represents | Main question |
| --- | --- | --- |
| Event, alert, or report | An observable signal or supplied occurrence | What happened or crossed a threshold? |
| Operational incident | A disruptive or threatening occurrence under coordinated response | What impact must be limited or ended? |
| Incident record | The living state and chronology of that response | What is true now, who controls what, and what happens next? |
| Problem | An underlying or recurring cause to investigate | Why do incidents occur or threaten to recur? |
| [Defect report](failures-defects-and-defect-reports.md) | Evidence and lifecycle of a suspected or confirmed flaw | Which expectation may a work product violate? |
| Change or corrective work | An independently governed alteration | What accepted change should be delivered and verified? |
| Post-incident review | Reflection and learning after response | What contributed, what was learned, and what should change? |

Some occurrences also activate a security, privacy, safety, legal, disaster,
or business-continuity process. NIST, for example, treats cybersecurity
incident response as part of a broader detection, response, and recovery
system.[^nist-800-61r3] A safe operational record may coexist with a restricted
record rather than exposing sensitive evidence in the ordinary tracker. The
governing response regime owns access, notification, evidence preservation,
and escalation requirements.

## What the living record must preserve

A useful incident record preserves enough shared truth to coordinate under
pressure, perform an explicit handoff, justify closure, and reconstruct the
response later:

- observed or threatened impact, affected and tested-unaffected scope, and
  severity basis;
- current service and response state, last update, next objective, and exit
  criteria;
- current command, delegated roles, action owners, and acknowledged handoffs;
- start, detection, declaration, mitigation, impact-end, restoration,
  recovery, and closure times when applicable, including uncertainty;
- timestamped observations, hypotheses, decisions, actions, results, and
  communications with their source or authority;
- current mitigation, expected signal, rollback or fallback information, and
  residual risk;
- links to safe supporting evidence and each response surface; and
- links to the review, defects, recovery, and corrective work that follow.

Early uncertainty is normal. Silently rewriting a hypothesis as though it had
always been known destroys the chronology that response, review, and later
analysis depend on.

## Tool independence

The record may live in a dedicated incident platform, an IT service-management
system, or an ordinary issue tracker. Automation may project the same incident
into several tools. Tool independence does not mean every field must be copied
into Markdown; it means the incident identity, current authority, state,
evidence, and relationships remain recoverable without depending on a vendor's
ambiguous label.

For the portable transition and relationship procedure, see [Maintaining
work-item identity, relationships, and
lifecycle](maintaining-work-item-identity-relationships-and-lifecycle.md). For
field and label projection, see [Managing work-item metadata and
labels](managing-work-item-metadata-and-labels.md). For the incident-specific
recording procedure and progressive tracker-ready template, see [Recording
operational incidents](recording-operational-incidents.md).

[^atlassian-incident-response]: Atlassian, “How we respond to an incident.”
[^google-sre-incidents]: Google SRE, “Managing Incidents.”
[^iso-23612]: ISO/IEC/IEEE 23612:2026, generic incident-management process and supporting documentation scope.
[^iso-25011]: ISO/IEC TS 25011:2017, IT service-quality models and acceptance uses.
[^microsoft-incident-management]: Microsoft Azure Well-Architected Framework, “Develop an Incident Management Practice to Recover from Disruptions.”
[^nist-800-61r3]: NIST SP 800-61 Rev. 3, cybersecurity incident-response recommendations and considerations.
