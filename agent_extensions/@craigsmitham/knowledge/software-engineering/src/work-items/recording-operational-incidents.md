---
type: Guide
title: Recording operational incidents
description: How to create and maintain a safe live incident record with impact evidence, command roles, current objectives, actions, communication, chronology, handoffs, exit criteria, closure validation, and independently owned follow-up.
tags:
  [
    incident-report,
    incident-record,
    outage,
    service-degradation,
    severity,
    timeline,
    incident-response,
    incident-command,
    communication,
    handoff,
    mitigation,
    restoration,
    recovery,
    closure,
    issue-template,
  ]
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
  - id: google-incident-document
    resource: https://sre.google/sre-book/incident-document/
    title: Google SRE — Example Incident State Document
  - id: microsoft-incident-management
    resource: https://learn.microsoft.com/en-us/azure/well-architected/design-guides/incident-management
    title: Microsoft Azure Well-Architected Framework — Develop an incident management practice
  - id: pagerduty-roles
    resource: https://response.pagerduty.com/before/different_roles/
    title: PagerDuty Incident Response — Different roles
  - id: nist-800-61r3
    resource: https://csrc.nist.gov/pubs/sp/800/61/r3/final
    title: NIST SP 800-61 Rev. 3 — Incident response recommendations and considerations
generated:
  by: codex/gpt-5
  at: 2026-08-21T22:08:15Z
---

# Recording operational incidents

Use this guide to create and maintain the recognized live work item for an
operational incident. It assumes the organization already owns declaration
thresholds, severity definitions, response authority, communication policy,
and runbooks. Apply those local rules without inventing missing decisions.

For why impact, service, response, understanding, and follow-up can be in
different states, read
[Operational incident records](operational-incident-records.md).

## Goal

Responders and stakeholders can recover the current impact, service and
response state, command, objectives, actions, chronology, communication, exit
criteria, and next transition without reconstructing them from chat or
interrupting the people doing mitigation.

## 1. Choose the correct and safe response channel

Create the record when observed or imminent service impact meets the local
threshold for coordinated response. Do not wait for a confirmed diagnosis. If
later evidence shows that the threshold was not met, retain that classification
and evidence instead of deleting the history.

Use or activate a specialized response process when security, privacy, safety,
legal, regulatory, disaster-recovery, or business-continuity conditions require
it. A linked operational record may contain a safe synopsis while sensitive
evidence remains in the governed system. NIST treats cybersecurity incident
response as its own detection, response, and recovery discipline.
[^nist-800-61r3]

For any public record, do not include credentials, personal information,
private customer content, confidential commercial data, exploitable security
details, or restricted links. Redact the evidence or link an approved
access-controlled location.

If no coordinated response is required, preserve the observation in the
appropriate event, alert, support, defect, or investigation artifact rather
than manufacturing an incident lifecycle.

## 2. Establish one incident identity and its relationships

Search for an existing incident that owns the same active response. Add an
observation to that record when it is another source of the same occurrence.
Create a separate related or child incident when it has independently managed
impact, command, communication, or closure conditions.

Record the declaration source and time, declaring authority, triggering alert
or report, and parent, child, duplicate, or related incident identifiers. One
wider event can produce several incidents, while recurring incidents can link
to one problem or defect without losing their individual chronology.

## 3. Title and continuously re-derive the live brief

Name the affected service and observed impact:

> Checkout unavailable for some European customers

Avoid a title that asserts an unconfirmed cause, such as “Database connection
pool bug.” Keep severity in a structured field when the host supports one; it
can change without changing the incident's identity.

Pair the title with a one- or two-sentence summary of current impact, service
state, response state, and immediate objective. Re-derive it at every material
change; an incident brief describes a situation in motion. See
[Titling and summarizing work items](titling-and-summarizing-work-items.md).

## 4. Establish command, delegated roles, and response surfaces

Record the current incident commander, manager, or lead and the authority the
local process gives that role. Add technical or operations, communications,
planning, scribe, liaison, or other roles only when the incident needs them.
One person can hold several roles in a small response; larger incidents can
delegate or split workstreams.[^pagerduty-roles]

Link the surfaces responders need:

- command channel or bridge;
- live incident record or state document;
- dashboards, logs, traces, runbooks, and controlled evidence;
- internal and external status communication; and
- parent, child, or parallel specialized-response records.

Name which surface owns the current state. Chat can preserve a useful
timestamped stream, but it should not become the only place to discover who is
in command, what impact remains, or what action comes next. Google recommends a
living incident document with the most important current information at the
top.[^google-sre-incidents]

## 5. Bound impact and derive severity from evidence

Record what is affected, how, since when, and to what known extent. Include
users, business functions, services, regions, operations, dependencies, data,
or service objectives when they change the response. Also record comparable
conditions tested without the impact; tested-unaffected scope can constrain the
blast radius as usefully as affected scope.

Use the local severity definition and cite the evidence that satisfies it.
Separate:

- **severity** — the impact or threat under the local scale;
- **priority** — a relative attention decision when several demands compete;
- **response phase or status** — where coordination currently stands; and
- **service state** — what level of service is actually available.

Change severity when the evidence changes. Preserve the earlier decision and
time rather than rewriting history. Do not invent affected users, business
impact, safety consequences, data loss, or a service-level violation merely to
complete the form.

## 6. Put current control and objectives first

At the top of the record, keep what a responder joining now needs:

- current impact, service state, response phase, severity, and last update;
- current command and delegated roles;
- current objective and mitigation or containment;
- active actions, owners, dependencies, and blockers;
- exit or monitoring criteria and their observation window;
- next decision or action and its owner; and
- next promised update time and audience.

Define exit criteria as observable service and impact evidence, not “the fix is
deployed.” Google’s example state document uses measurable service objectives
over an observation period.[^google-incident-document] A proposed mitigation
can be an action; it is not evidence of its own success.

## 7. Maintain chronology, decisions, and evidence

Append timestamped observations, reports, hypotheses, decisions, actions,
results, role changes, and material communications. Include a timezone and
state uncertainty when the exact event time is unknown. When useful,
distinguish when something occurred from when it was reported or recorded.

For consequential entries, preserve:

- source or actor;
- whether the statement is observed, measured, reported, inferred, or
  hypothesized;
- action owner and authorization;
- decision rationale and rejected alternatives when material;
- expected signal, rollback or fallback, and result; and
- safe evidence links.

Do not erase an earlier belief when evidence changes it; append the correction.
Atlassian recommends recording observations, changes, and decisions from
otherwise unrecorded conversations so the response can later be reconstructed.
[^atlassian-incident-response]

## 8. Communicate current truth on the local cadence

Apply the established communication policy for responders, internal
stakeholders, support, customers, regulators, or other audiences. Record the
last and next update times so stakeholders know when to expect information.

An update should state only what its audience needs:

- current impact and scope;
- current response or service state;
- material change since the prior update;
- mitigation or next objective when safe to disclose; and
- when the next update will arrive.

Keep internal technical hypotheses out of external communications unless they
are sufficiently supported and approved for that audience. Record a link or
safe synopsis in the incident record rather than copying restricted content.
Microsoft recommends predefined channels, cadence, message formats, and closure
communication.[^microsoft-incident-management]

## 9. Scale the response and hand off explicitly

Add people, delegated roles, or child workstreams when current owners are
overloaded, the incident crosses authority boundaries, or prolonged response
requires rotation. Avoid uncoordinated changes by making technical action
ownership visible.

For a handoff, update the record with:

- incoming and outgoing owners and roles;
- current impact, service state, objective, and working hypotheses;
- actions in progress, results awaited, blockers, and responder needs;
- next decision, exit criteria, and communication deadline; and
- the time both parties acknowledged the transfer.

Google treats command handoff as an explicit acknowledged transfer and makes
the new authority visible to the response team.[^google-sre-incidents] Do not
infer transfer merely because another person joined the channel.

## 10. Mitigate, monitor, and validate

Record each containment, mitigation, rollback, fallback, or emergency change
with its authority, expected signal, result, and reversal path when applicable.
Limit harm first; do not delay a safe authorized mitigation while attempting to
prove a root cause.

After the signal improves, monitor against the stated exit criteria for the
required period. Validate the affected path and material adjacent or
tested-unaffected conditions. Check relevant service objectives, functions,
dependencies, and data—not only whether an alert cleared.

If current impact ends while the service remains degraded or recovery remains
incomplete, state that explicitly. Record the temporary control, acceptable
duration, residual risk, recovery owner, and condition that would reactivate
coordinated response. Microsoft distinguishes mitigation from validation and
warns against premature closure.[^microsoft-incident-management]

## 11. Resolve or close under the local policy

Apply the host's state names and closure authority. Preserve the underlying
moments separately when they exist:

- impact started;
- detected or reported;
- incident declared and acknowledged;
- mitigation took effect;
- impact ended;
- service met its restoration criteria;
- required recovery completed; and
- coordinated response closed.

Do not duplicate timestamps the host captures correctly, and never invent a
precise time when only a range or first-known observation is available.

Before closure, record the criteria, validation evidence, observation window,
residual degraded state or risk, ongoing recovery owner, closure decision and
authority, and final communications. Atlassian ends emergency response when
current or imminent business impact ends; other hosts require fuller
restoration or validation.[^atlassian-incident-response]
The portable rule is to make the chosen boundary and its evidence explicit.

## 12. Link the independently owned follow-up chain

Depending on what the occurrence reveals and local policy requires, link:

- a post-incident review and its owner;
- one or more [defect reports](recording-defect-reports.md) or problem reports;
- recovery, cleanup, data repair, or temporary-control removal;
- reliability, monitoring, process, documentation, or training improvements;
- corrective changes and their verification; and
- parent, child, recurring, or related incidents.

Do not use the incident's resolved or closed state as a proxy for completing
those artifacts. Conversely, do not keep emergency response open merely to
hold a permanent-fix backlog.

## Tracker-ready template

Start with the minimum live state. Add coordination and transition sections as
the incident grows or the local process requires them. Omit empty sections
rather than inventing content, and do not duplicate identifiers, roles,
timestamps, or status fields that the host already captures correctly.

```markdown
# <Affected service>: <observed impact>

## Minimum live state

- Incident identity:
- Response phase or status:
- Severity and evidence:
- Incident lead or commander:
- Impact started: <timestamp, range, or unknown>
- Detected or reported:
- Declared:
- Acknowledged:
- Last updated: <timestamp and timezone>
- Next update: <timestamp, audience, and channel>
- Command channel or bridge:
- Internal and external status links:

### Current brief

One or two sentences: current impact, service and response state, and immediate
objective.

### Impact and scope

- Affected users, functions, services, regions, operations, or data:
- Known extent and evidence:
- Tested-unaffected or unknown scope:
- Relevant service objective or threshold:

### Current control

- Current objective:
- Active mitigation or containment:
- Expected signal:
- Exit or monitoring criteria and observation window:
- Next action, owner, and dependency or blocker:

## Active coordination

Add when roles or workstreams are delegated.

### Roles

| Role or workstream           | Current owner | Authority or responsibility | Since |
| ---------------------------- | ------------- | --------------------------- | ----- |
| Incident command             |               |                             |       |
| Technical or operations      |               |                             |       |
| Communications               |               |                             |       |
| Scribe, planning, or liaison |               |                             |       |

### Actions

| Action | Owner | Expected signal | State or result | Reversal or fallback |
| ------ | ----- | --------------- | --------------- | -------------------- |
|        |       |                 |                 |                      |

### Decisions and hypotheses

- <timestamp> — <fact, hypothesis, decision, authority, rationale, or correction>

### Timeline

- <event time or range> — <observation, report, action, result, role change,
  or communication> — <source or actor>

### Communications

- Internal audience, last update, and next update:
- External audience, last update, and next update:
- Approved safe synopsis or links:

### Handoffs

- Outgoing and incoming roles:
- Current state, objective, actions, blockers, and next decision:
- Acknowledged at:

### Safe evidence

Redacted dashboards, logs, traces, screenshots, change records, runbooks, or
access-controlled evidence links.

## Resolution and transition

### Important times

- Mitigation took effect:
- Impact ended:
- Service restoration criteria met:
- Required recovery completed:
- Coordinated response closed:

### Validation and residual state

- Exit criteria:
- Validation evidence and observation window:
- Remaining degraded functions, recovery, cleanup, or temporary controls:
- Residual risk and reactivation condition:

### Closure

- Decision, authority, and rationale:
- Final internal communication:
- Final external communication:

### Follow-up

- Post-incident review and owner:
- Defects, problems, and corrective changes:
- Recovery, cleanup, or data repair:
- Reliability, monitoring, process, or documentation improvements:
- Parent, child, recurring, or related incidents:
```

## Final check

- The record uses the correct public, restricted, security, safety, disaster,
  or business-continuity channel.
- One incident identity owns the active response; parent, child, duplicate,
  and recurring relationships remain visible.
- A newly joining responder can recover current impact, service and response
  state, command, objective, next action, and next update without a briefing.
- Severity and scope are supported by evidence; tested-unaffected and unknown
  scope remain distinct.
- Active roles, workstreams, actions, and authority are visible and scale to
  the incident rather than a mandatory organization chart.
- Exit criteria are observable; a deployed change or cleared alert was not
  treated as proof of recovery by itself.
- Times include a timezone and uncertainty; facts, reports, hypotheses,
  decisions, actions, and results remain distinguishable.
- Internal and external communications use approved content, audience,
  cadence, and channels without leaking restricted evidence.
- Command and workstream handoffs are explicit, acknowledged, and recoverable.
- Impact end, restoration, recovery, closure, and permanent correction remain
  distinct, even if the host maps several to one status.
- Closure names its criteria, validation evidence, authority, residual state,
  and reactivation condition.
- Review, recovery, defects, and corrective work are linked and independently
  owned.

[^atlassian-incident-response]: Atlassian, “How we respond to an incident.”

[^google-incident-document]: Google SRE, “Example Incident State Document.”

[^google-sre-incidents]: Google SRE, “Managing Incidents.”

[^microsoft-incident-management]: Microsoft Azure Well-Architected Framework, “Develop an Incident Management Practice to Recover from Disruptions.”

[^nist-800-61r3]: NIST SP 800-61 Rev. 3, cybersecurity incident-response recommendations and considerations.

[^pagerduty-roles]: PagerDuty Incident Response, “Different Roles.”
