---
type: Explanation
title: Operational incident records
description: Why an operational incident record coordinates response to a time-bounded service disruption rather than serving as an urgent defect report or permanent-fix backlog item.
tags: [incident, incident-record, outage, service-degradation, incident-management, operations, reliability, work-item]
status: draft
sources:
  - id: atlassian-incident-handbook
    resource: https://www.atlassian.com/incident-management/handbook
    title: Atlassian Incident Management Handbook
  - id: google-sre-incidents
    resource: https://sre.google/sre-book/managing-incidents/
    title: Google SRE — Managing Incidents
  - id: jira-itsm-categories
    resource: https://support.atlassian.com/jira-service-management-cloud/docs/what-are-ticket-categories/
    title: Jira Service Management — What are work categories?
  - id: nist-incident-glossary
    resource: https://csrc.nist.gov/glossary/term/Computer_Security_Incident
    title: NIST — Computer Security Incident
generated:
  by: codex/gpt-5
  at: 2026-08-16T00:17:02Z
---

# Operational incident records

An **operational incident** is an unplanned occurrence that disrupts, reduces,
or imminently threatens the quality of a service and warrants coordinated
response. Its **incident record** is the live work artifact that keeps that
response oriented around current impact, restoration, ownership, and shared
facts.

The record is not simply an urgent bug. An incident describes an occurrence in
time; a defect describes a flaw relative to an expectation. Either can exist
without the other. A capacity limit, expired certificate, operator mistake, or
upstream outage can produce an incident without a software defect. A latent
defect can exist for years without causing an incident.

## The restoration boundary

Incident management optimizes first for limiting harm and restoring normal
service. Atlassian treats the incident as resolved when the current or imminent
impact has ended; root-cause investigation and permanent corrective work may
continue afterward.[^atlassian-incident-handbook] Google similarly emphasizes
clear roles, current state, communication, and a retained live record during
response.[^google-sre-incidents]

This boundary prevents one work item from claiming several incompatible
completion conditions:

```text
Disruption or threat
└── Incident record — coordinate response until impact ends
    ├── Post-incident review — learn from the occurrence
    ├── Defect report — correct a confirmed or suspected flaw
    └── Other corrective work — reduce recurrence or improve response
```

Closing the incident record says that emergency response has ended. It does not
say every cause is understood or every follow-up is complete.

## Neighboring concepts

| Concept | What it represents | Main question |
| --- | --- | --- |
| Event or alert | An observable signal | What happened or crossed a threshold? |
| Operational incident | A disruptive or threatening occurrence | What impact needs coordinated response? |
| Incident record | The shared live state of that response | What is true now, who owns what, and what changed? |
| Problem | An underlying or recurring cause to investigate | Why do incidents occur or threaten to recur? |
| Defect | A flaw in a software work product | Where does the product fail an accepted expectation? |
| Post-incident review | Reflection and learning after response | What contributed, what was learned, and what should change? |

IT service-management systems commonly model incidents, problems, changes, and
post-incident reviews as separate categories because their fields and lifecycles
differ.[^jira-itsm-categories] Security practice also uses *incident* for
occurrences that actually or potentially jeopardize information or systems;
an organization may therefore qualify this artifact as a *service incident*,
*security incident*, or the broader *operational incident*.[^nist-incident-glossary]

## What the record must preserve

A useful incident record preserves enough shared truth to coordinate under
pressure and reconstruct the response later:

- observed or threatened impact and affected services;
- current status, severity, and explicit ownership;
- start, detection, mitigation, and end times with timezones;
- timestamped observations, decisions, actions, and handoffs;
- the current mitigation or workaround;
- communication and supporting-evidence links; and
- links to the review, defects, and corrective work that follow.

The record should distinguish facts from hypotheses. Early uncertainty is
normal; silently rewriting a guess as though it had always been known destroys
the chronology that later learning depends on.

## Tool independence

The record may live in a dedicated incident platform, an ITSM system, or an
ordinary issue tracker with a template and label. The medium matters less than
having one authoritative live record, a known response process, and links to
artifacts whose lifecycles continue after restoration.

For the authoring procedure and a tracker-ready template, see
[Recording operational incidents](recording-operational-incidents.md).

[^atlassian-incident-handbook]: Atlassian Incident Management Handbook.
[^google-sre-incidents]: Google SRE, “Managing Incidents.”
[^jira-itsm-categories]: Jira Service Management, “What are work categories?”
[^nist-incident-glossary]: NIST Computer Security Incident glossary entry.
