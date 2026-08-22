---
type: Guide
title: Recording feature requests
description: How to preserve a source request, frame an evaluable need and desired outcome, add proportional evidence and context, and retain the resulting decision without prescribing an unapproved solution.
tags: [feature-request-template, customer-request, enhancement-request, product-feedback, source-provenance, desired-outcome, request-triage, delivery-traceability]
status: draft
sources:
  - id: feature-explainer
    resource: feature-requests-requirements-and-delivery-work.md
    title: Feature requests, requirements, and delivery work
  - id: linear-customer-requests
    resource: https://linear.app/docs/customer-requests
    title: Linear Docs — Customer Requests
  - id: linear-design
    resource: https://linear.app/method/manage-design-projects
    title: Linear Method — Manage design projects
  - id: github-issue-manager
    resource: https://docs.github.com/en/enterprise-cloud@latest/copilot/tutorials/customization-library/custom-instructions/issue-manager
    title: GitHub Docs — Issue manager customization example
  - id: jira-ideas
    resource: https://www.atlassian.com/software/jira/product-discovery/guides/ideas/overview
    title: Atlassian — Jira Product Discovery ideas overview
generated:
  by: codex/gpt-5
  at: 2026-08-21T21:30:41Z
---

# Recording feature requests

Use this guide to record desired new or changed functionality before the
organization has committed to a particular requirement, solution, or delivery
item. For the distinctions among source requests, normalized feature requests,
requirements, and delivery work, read
[Feature requests, requirements, and delivery work](feature-requests-requirements-and-delivery-work.md).

## Goal

A reviewer can recover what was requested and why, understand the affected
context, evaluate the need and desired outcome, and trace any later decision
without mistaking the requester's first solution idea for an approved
specification.

## 1. Confirm that a feature request is the right artifact

Ask which lifecycle fact the item must preserve:

- If existing behavior may violate an accepted expectation, write a
  [defect report](recording-defect-reports.md).
- If current or imminent service impact requires coordinated response, create
  an [operational incident record](recording-operational-incidents.md).
- If only uncertainty reduction has been authorized, create an investigation.
- If behavior, scope, and delivery authority are already accepted, use the
  host's applicable requirement, delivery item, or task and link the request as
  provenance.
- Otherwise, continue with a feature request.

Improving an existing screen or workflow can still be a feature request when
the current product does not already promise the requested behavior.

## 2. Decide which request record you are creating

Determine whether the item is:

- a **source request occurrence** that preserves one attributable expression
  of feedback or desired change; or
- a **normalized feature request** that frames an evaluable need or outcome and
  may aggregate several source occurrences.

When the host supports separate customer-request or feedback objects, keep the
source occurrences there and link them to the normalized request. Linear, for
example, retains source context on customer requests linked to issues or
projects.[^linear-customer-requests] When the host has only one suitable
container, preserve both layers in the item without presenting the normalized
summary as a verbatim source statement.

## 3. Preserve the source and provenance

Record the source type, date, relevant context, direct statement or faithful
synopsis, and authoritative link when available. Preserve who or what
established supplied evidence and whether it is observed, reported, inferred,
or hypothesized.

Do not silently replace “please add CSV export” with a newly inferred need and
then attribute that analysis to the requester. Keep the source request and the
normalized need visibly distinct.

For a public work item, do not copy personal information, private customer
content, credentials, confidential commercial data, or restricted links into
the public artifact. Use a safe synopsis and an access-controlled source link
when the provenance itself is not public.

## 4. Title and summarize the desired ability or outcome

Use language that survives alternative designs:

> Let account owners reconcile invoice history in external systems

Avoid identifying the request only as a widget or mechanism, such as “Add CSV
button,” unless that mechanism is itself a genuine constraint. Add a one- or
two-sentence summary that states the current limitation and desired outcome;
see [Titling and summarizing work items](titling-and-summarizing-work-items.md).

## 5. Describe the affected context, limitation, and outcome

State:

- who or what encounters the need, including the relevant role, system, or
  workflow;
- when and under which conditions the need arises;
- what they are trying to accomplish;
- what prevents or complicates that today;
- what should become possible or easier; and
- why that outcome matters.

Do not invent a persona or claim broad demand when the evidence represents one
request occurrence. A stakeholder's proposed feature is often bounded by their
view of the problem; the team still needs to verify the underlying need.
[^linear-design]

## 6. Add representative scenarios proportionately

Add scenarios when different actors, triggers, environments, paths, or desired
results materially change how the request should be understood. Each scenario
should make the actor, trigger, context, current result, and desired result
clear.

Do not require an arbitrary number of scenarios. One may be enough for a narrow
request; several may be needed to expose a meaningful variation. Do not expand
intake into an exhaustive edge-case specification before the request is
selected for further work.

## 7. Separate evidence, confidence, and unknowns

Attach the evidence actually available: related request occurrences, research,
support conversations, workflow observations, usage data, revenue or risk
context, experiments, or an attributed report. State what the evidence
supports and distinguish measurement from expectation.

Record consequential unknowns and what could resolve them. A single request
may justify preserving and triaging the signal without proving widespread
demand, customer value, feasibility, or the best response. Product-discovery
systems similarly keep insights, hypotheses, validation methods, and decisions
distinct while an idea is being shaped.[^jira-ideas]

## 8. Record constraints and boundaries

State legal, policy, compatibility, accessibility, performance, security,
operational, or integration constraints that any acceptable response must
respect. Add known non-goals when they prevent predictable scope confusion.

Label an unverified constraint as reported or assumed. Do not fill the item
with every possible edge case or turn a preferred implementation into a
constraint without authority.

## 9. Keep proposed solutions optional and explicit

Capture suggested approaches under **Possible solution**, not as the request's
identity. Mark whether each approach is illustrative, proposed, recommended,
accepted, rejected, or unresolved. Include alternatives or tradeoffs only when
the source already supports them.

Separating the problem, proposed solution, use cases, and success criteria is
also reflected in GitHub's issue-management customization example.
[^github-issue-manager]

## 10. Define success signals without inventing acceptance criteria

Describe the observable change that would indicate the need was addressed. A
useful signal may include a baseline, target, or decision-relevant period when
those are known, but an intake request need not fabricate them.

Keep three ideas distinct:

- an **outcome signal** indicates whether the affected condition improved;
- a **verification or acceptance condition** defines observable behavior an
  accepted solution must satisfy; and
- a **testing strategy** states how evidence will be gathered.

Do not use “feature shipped” as the only success signal when the request exists
to improve a stakeholder or organizational outcome.

## 11. Preserve existing design and delivery context

When the source already contains findings, constraints, option tradeoffs,
architecture or code sketches, an implementation sequence, a testing strategy,
or open questions, preserve that material or link its authoritative home. Mark
its provenance and authority state; existing detail does not itself approve a
solution or authorize delivery.

See [Preserving design and delivery context in software work items](preserving-design-and-delivery-context.md).

## 12. Preserve the triage result and relationships

Triage may merge the request with related demand, decline it, defer it, request
research, or accept a need, requirement, solution, or delivery response. Record
the decision, decision authority, rationale, next review or action, and links
to the artifacts that carry later lifecycle stages.

Do not silently turn the original request into a different artifact and lose
its provenance. Several source requests may link to one normalized request or
accepted capability, and one broad request may produce several requirements or
delivery items.

## Tracker-ready template

Use the minimum intake first. Add optional enrichment only when source material
or later analysis supports it; omit empty sections rather than inventing
content.

```markdown
# <Affected context> can <desired ability or outcome>

## Minimum intake

### Summary

What is difficult or impossible today, what should become possible, and why
does that matter?

### Source and provenance

- Record type: source request occurrence | normalized feature request
- Source type and date:
- Context:
- Direct statement or faithful synopsis:
- Authoritative link:

### Affected context

Who or what has the need, and when does it arise?

### Current limitation

What are they trying to accomplish, and what prevents or complicates it today?

### Desired outcome

What should become possible or easier, and why does that matter?

## Optional enrichment

### Representative scenarios

When different actors, triggers, contexts, or results clarify the request.

### Evidence and confidence

What evidence exists, what does it support, and how strong or representative is it?

### Unknowns and questions

What remains uncertain, and what could resolve it?

### Constraints and non-goals

What must an acceptable response respect? What is deliberately outside this request?

### Possible solution

Optional proposals with their current authority state.

### Technical design and delivery context

Optional supplied findings, constraints, decision status, architecture or code
sketches, implementation sequence, testing strategy, tradeoffs, and open
questions. Link longer or independently reviewed artifacts.

### Success signals

What observable change would indicate that the need was addressed?

## Lifecycle

### Status and decision

- Current state:
- Decision:
- Decision authority:
- Rationale:
- Next review or action:

### Relationships

- Source requests:
- Related or duplicate requests:
- Discovery or research:
- Accepted requirements, designs, or delivery work:
```

## Final check

- The artifact is visibly a source occurrence or a normalized feature request.
- Source wording and normalized analysis are distinguishable and traceable.
- Public content contains no private or restricted source material.
- The title and summary say what is difficult and which outcome matters.
- The item represents new or changed functionality rather than an accepted
  expectation that may be defective.
- Evidence is attributed, its limits are visible, and unknowns were not filled
  with invented facts.
- Scenarios and constraints are proportional to what is known and material.
- A proposed solution remains optional until the applicable authority accepts it.
- Outcome signals, verification conditions, and testing strategy remain distinct.
- Existing technical context is preserved or linked with its authority state.
- The triage decision and later artifacts remain linked without rewriting the
  original request into a different lifecycle stage.

[^github-issue-manager]: GitHub Docs, “Issue manager customization example.”
[^jira-ideas]: Atlassian, “Jira Product Discovery ideas overview.”
[^linear-customer-requests]: Linear Docs, “Customer Requests.”
[^linear-design]: Linear Method, “Manage design projects.”
