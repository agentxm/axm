---
type: Guide
title: Writing feature requests
description: How to write a feature request that preserves the affected context, underlying need, desired outcome, evidence, constraints, and success signals without prematurely prescribing a solution.
tags: [feature-request-template, enhancement-request, product-feedback, desired-outcome, use-case, request-triage, customer-request]
status: draft
sources:
  - id: feature-explainer
    resource: feature-requests-and-delivery-work.md
    title: Feature requests and delivery work
  - id: github-issue-manager
    resource: https://docs.github.com/en/enterprise-cloud@latest/copilot/tutorials/customization-library/custom-instructions/issue-manager
    title: GitHub Docs — Issue manager customization example
  - id: linear-design
    resource: https://linear.app/method/manage-design-projects
    title: Linear Method — Manage design projects
generated:
  by: codex/gpt-5
  at: 2026-08-16T00:17:02Z
---

# Writing feature requests

Use this guide to request new functionality or a meaningful change to existing
functionality before the organization has committed to deliver a particular
solution. For the distinction between request intake and accepted delivery
work, read [Feature requests and delivery work](feature-requests-and-delivery-work.md).

## Goal

A reviewer can understand who is affected, what need or limitation exists,
which outcome matters, and what evidence supports evaluation without treating
the requester’s first solution idea as an approved specification.

## 1. Confirm that the expectation is new or changing

Ask whether the current product already promises the requested behavior. If it
does and the product fails that expectation, write a
[defect report](reporting-software-defects.md). If not, continue with a feature
request even when the request improves an existing screen or workflow.

## 2. Title the desired ability or outcome

Use language that survives alternative designs:

> Let account owners export invoice history for external reconciliation

Avoid only naming a widget or implementation, such as “Add CSV button,” unless
the mechanism is itself the requirement. Add a one- or two-sentence summary that
states the current limitation before the desired outcome; see
[Titling and summarizing work items](titling-and-summarizing-work-items.md).

## 3. Identify the affected context

Name the person, role, system, or workflow with the need. Describe when the
need arises and the current behavior or workaround. Do not invent a persona or
claim broad demand when the evidence represents one requester.

## 4. State the need and desired outcome

Explain:

- what the affected party is trying to accomplish;
- what prevents or makes that difficult today;
- what should become possible or easier; and
- why that outcome matters.

Linear’s design guidance cautions that a stakeholder’s requested feature is
often constrained by their view of the problem; the team still needs to verify
the underlying need.[^linear-design]

## 5. Add representative scenarios and evidence

Give two or three concrete examples when different conditions clarify the
request. Attach the evidence actually available: request counts, research,
support conversations, workflow observations, revenue or risk context, or a
single attributed report. Distinguish measured evidence from expectation.

## 6. Record constraints and boundaries

State legal, policy, compatibility, accessibility, performance, or integration
constraints that any acceptable response must respect. Add known non-goals
when they prevent predictable scope confusion. Do not fill the item with every
possible edge case before it is selected for delivery.

## 7. Keep proposals optional and explicit

Capture suggested approaches under **Possible solution**, not as the request’s
identity. Include tradeoffs or rejected alternatives only when evidence
already exists. GitHub’s own issue-management example similarly separates the
problem, proposed solution, use cases, and success criteria.[^github-issue-manager]

## 8. Define success signals

Describe the observable change that would show the need was addressed. At
intake, this may be a qualitative user outcome rather than a delivery-ready
acceptance test. Do not use “feature shipped” as the only signal when the
request exists to improve an external outcome.

## 9. Preserve the triage result

Triage may merge the request with related demand, decline it, defer it, request
research, or accept it for delivery. Record that decision and link any accepted
feature, story, Product Backlog Item, requirement, or specification. Do not
silently turn the original request into a different artifact and lose its
provenance.

## Tracker-ready template

```markdown
# <Affected party> can <desired ability or outcome>

## Summary

One or two sentences: what the affected party cannot do today and why that
matters.

## Affected context

Who or what has the need, and when does it arise?

## Current limitation

What are they trying to accomplish, and what prevents or complicates it today?

## Desired outcome

What should become possible or easier, and why does that matter?

## Representative scenarios

1. When ...
2. When ...

## Evidence

Observed demand, research, examples, or other supporting evidence.

## Constraints and non-goals

What must an acceptable response respect? What is deliberately outside this request?

## Possible solution

Optional proposal, clearly distinguished from the need.

## Success signals

What observable change would indicate that the need was addressed?

## Related work

Duplicates, related requests, research, or accepted delivery items.
```

## Final check

- The title and summary alone say what is missing and why it matters.
- The item describes new or changed expectation rather than a defect.
- The affected context and underlying need are explicit.
- Evidence is attributed and not overstated.
- The desired outcome can survive a different implementation.
- Constraints are real; speculative edge cases have not taken over the item.
- A proposal is visibly optional until a product or design decision accepts it.
- The request can remain linked to later delivery work without becoming it.

[^github-issue-manager]: GitHub Docs, “Issue manager customization example.”
[^linear-design]: Linear Method, “Manage design projects.”
