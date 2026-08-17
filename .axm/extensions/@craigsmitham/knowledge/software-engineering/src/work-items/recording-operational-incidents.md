---
type: Guide
title: Recording operational incidents
description: How to create and maintain a live incident work item with clear impact, status, ownership, timing, decisions, mitigation, and follow-up links.
tags: [incident-report, incident-ticket, outage, service-degradation, severity, timeline, incident-response, issue-template]
status: draft
sources:
  - id: incident-records
    resource: operational-incident-records.md
    title: Operational incident records
  - id: atlassian-incident-response
    resource: https://www.atlassian.com/incident-management/handbook/incident-response
    title: Atlassian — How we respond to an incident
  - id: google-sre-incidents
    resource: https://sre.google/sre-book/managing-incidents/
    title: Google SRE — Managing Incidents
generated:
  by: codex/gpt-5
  at: 2026-08-16T00:17:02Z
---

# Recording operational incidents

Use this guide to create and maintain the authoritative live work item for an
operational incident. It assumes the organization already owns declaration
thresholds, severity definitions, response roles, communication channels, and
runbooks. For the artifact boundaries, read
[Operational incident records](operational-incident-records.md).

## Goal

Responders and stakeholders can determine the current impact, response state,
ownership, chronology, and next action without reconstructing them from chat or
asking the person doing the mitigation.

## 1. Declare from impact, not diagnosis

Create the record when the observed or imminent service impact meets the local
incident threshold. Do not wait for a confirmed root cause. If investigation
later shows that the threshold was not met, preserve that conclusion in the
record instead of deleting the history.

## 2. Title the observed impact

Name the affected service and user-visible or operational symptom:

> Checkout unavailable for some European customers

Avoid titles that assert an unconfirmed cause, such as “Database connection
pool bug.” Keep severity in a structured field when the tracker supports one;
it changes more often than the incident identity.

Pair the title with a one- or two-sentence summary of current impact and
response state, and re-derive it at every material change — an incident brief
describes a situation in motion, not a settled one. See
[Titling and summarizing work items](titling-and-summarizing-work-items.md).

## 3. Put live state first

At the top of the record, keep the information someone joining now needs:

- current status and last-update time;
- severity and the impact evidence supporting it;
- affected services, users, regions, or operations;
- incident lead and other active response roles;
- start and detection times, or `unknown`; and
- links to the response channel, dashboards, and status communication.

Use one timezone consistently. Never invent a precise time when only a range or
first-known observation is available.

## 4. Maintain a factual timeline

Append timestamped observations, decisions, actions, results, role handoffs,
and material communication. State hypotheses as hypotheses. Do not erase an
earlier belief when evidence changes it; append the correction.

The incident lead may delegate note-taking, but the record still needs one
recognized owner. Google SRE recommends a living incident document with the
most important current information at the top and a retained history for later
analysis.[^google-sre-incidents]

## 5. Keep restoration and permanent correction separate

Record the mitigation being attempted, the result, and the signal that will
show whether impact has ended. Link permanent-fix work rather than expanding
the incident into an open-ended implementation backlog.

Resolve the incident when current or imminent impact has ended under the local
policy. Capture end time, restoration evidence, residual risk, and the next
owner before closing the response.[^atlassian-incident-response]

## 6. Link the follow-up chain

Depending on what the occurrence reveals, link:

- a post-incident review;
- one or more defect reports;
- reliability, monitoring, process, or documentation improvements; and
- the parent or related incident when several records represent one event.

Do not use the incident’s resolved state as a proxy for the completion of those
items.

## Tracker-ready template

```markdown
# <Affected service>: <observed impact>

- Status:
- Severity and basis:
- Incident lead:
- Started: <timestamp, range, or unknown>
- Detected: <timestamp>
- Last updated: <timestamp and timezone>
- Response channel:

## Summary

One or two sentences: who is affected right now, and what the response is
doing about it.

## Impact

Who or what is affected, how, and to what known extent?

## Current state

What is true now? What mitigation is active or being attempted?

## Timeline

- <timestamp> — <observation, decision, action, or result>

## Resolution

- Impact ended:
- Restoration evidence:
- Residual risk or workaround:

## Follow-up

- Post-incident review:
- Defects and corrective work:
```

## Final check

- A newly joining responder can orient without a verbal briefing.
- The title and summary describe the situation as it stands now.
- Impact and severity are supported by evidence, not only labels.
- Times include a timezone and uncertainty remains explicit.
- Facts, hypotheses, actions, and outcomes are distinguishable.
- The record says what ended the impact.
- Follow-up work is linked and independently owned.

[^atlassian-incident-response]: Atlassian, “How we respond to an incident.”
[^google-sre-incidents]: Google SRE, “Managing Incidents.”
