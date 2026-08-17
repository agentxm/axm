---
type: Explanation
title: Feature requests and delivery work
description: Why a feature request is evidence of desired new or changed functionality rather than a commitment, specification, user story, or implementation task.
tags: [feature-request, enhancement, user-story, requirement, product-backlog-item, functionality, request-intake, work-item]
status: draft
sources:
  - id: github-issue-types
    resource: https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/managing-issue-types-in-an-organization
    title: GitHub Docs — Managing issue types in an organization
  - id: linear-issue-templates
    resource: https://linear.app/docs/issue-templates
    title: Linear Docs — Issue templates
  - id: jira-work-items
    resource: https://www.atlassian.com/software/jira/guides/issues/overview
    title: Atlassian — Jira work items overview
  - id: azure-work-items
    resource: https://learn.microsoft.com/en-us/azure/devops/boards/work-items/about-work-items
    title: Microsoft Azure Boards — About work items and work item types
  - id: scrum-pbi
    resource: https://www.scrum.org/resources/product-backlog-items
    title: Scrum.org — Product Backlog Items
  - id: ireb-glossary
    resource: https://cpre.ireb.org/en/downloads-and-resources/glossary
    title: IREB — CPRE Online Glossary
generated:
  by: codex/gpt-5
  at: 2026-08-16T00:17:02Z
---

# Feature requests and delivery work

A **feature request** is an intake artifact that records a stakeholder’s desire
for new or changed functionality. It preserves the affected context, underlying
need, and desired outcome so the request can be understood, combined with other
evidence, and evaluated.

The word **request** is load-bearing. Filing the artifact does not establish a
requirement, commit delivery, prove value, select a design, or authorize
implementation. It creates a durable input to those decisions.

## Why there is no universal delivery-item name

Current trackers use related terms at different levels:

| Host vocabulary | Typical meaning |
| --- | --- |
| GitHub `Feature` | A default issue type alongside Bug and Task |
| Linear `Feature request` | A common issue template or label for intake |
| Jira `Story` | A requirement expressed from a user perspective |
| Azure `Feature` | A portfolio item that groups requirement-level items |
| Azure `User Story`, `Product Backlog Item`, or `Requirement` | A delivery-level unit of customer value, depending on process |

These are not interchangeable definitions. GitHub makes Feature a peer of Bug
and Task, while Azure places Feature above requirements in its default
hierarchy.[^github-issue-types][^azure-work-items] Jira uses Story for a
user-perspective requirement, and Linear’s own examples distinguish bug reports
from feature requests at intake.[^jira-work-items][^linear-issue-templates]

For portable guidance, **feature request** is therefore a useful artifact name
for intake, but not a universal name for accepted delivery work.

## Neighboring concepts

| Concept | What it says | Why it is different |
| --- | --- | --- |
| Feature request | Someone wants new or changed functionality | It awaits evaluation and may retain a proposed solution |
| Feature | A recognizable product capability | Its planning granularity varies across organizations and tools |
| Enhancement | Existing behavior should improve | It is a useful subtype or synonym, but excludes some wholly new capability |
| Requirement | A capability or constraint the solution is obligated to satisfy | It carries stronger authority than a request |
| User story | A short user-perspective narrative of need and benefit | It is one representation technique, not every kind of functional work |
| Product Backlog Item | Work the product team intends to consider or undertake | It is deliberately generic and associated with Scrum vocabulary |
| Task | An action to perform | It describes execution rather than the need or outcome |

IREB describes a feature as a higher-level abstraction that typically comprises
several requirements and a user story as a short narrative of a user need and
expected benefit.[^ireb-glossary] Scrum likewise does not require every Product
Backlog Item to be a user story; items can represent functionality,
improvements, defects, experiments, or other work.[^scrum-pbi]

## Request, decision, and delivery

Keeping the stages distinct allows demand to accumulate without duplicating
implementation work:

```text
Need, limitation, or opportunity
└── Feature request — preserve the requester evidence
    └── Product decision — decline, defer, investigate, or accept
        └── Delivery item or specification — define accepted behavior
            └── Tasks and implementation — realize and verify it
```

Several requests may support one accepted capability. One broad request may
produce several delivery items. Linking those relationships is more truthful
than converting every incoming request directly into an implementation ticket.

## Need before solution

Stakeholders often describe the solution they can imagine: “add an export
button” or “support a webhook.” That proposal is useful evidence, but it should
not replace the underlying need. Preserving who is affected, what they cannot
accomplish, and what outcome they seek lets product and engineering discover a
smaller, safer, or more general response.

This does not make solution ideas forbidden. It makes their status explicit:
the request owns the problem and desired outcome; an accepted design owns the
chosen mechanism.

## Choosing another artifact

Use a different work item when:

- existing behavior violates an accepted expectation — write a
  [defect report](software-defects-and-defect-reports.md);
- service impact requires coordinated response — create an
  [operational incident record](operational-incident-records.md);
- only uncertainty reduction has been authorized — create an investigation;
  or
- the desired behavior and implementation are already accepted — create the
  host’s delivery item or task and link the original request evidence.

For the authoring procedure and a tracker-ready template, see
[Writing feature requests](writing-feature-requests.md).

[^azure-work-items]: Microsoft Azure Boards, “About work items and work item types.”
[^github-issue-types]: GitHub Docs, “Managing issue types in an organization.”
[^ireb-glossary]: IREB, CPRE Online Glossary entries for feature and user story.
[^jira-work-items]: Atlassian, “Jira work items overview.”
[^linear-issue-templates]: Linear Docs, “Issue templates.”
[^scrum-pbi]: Scrum.org, “Product Backlog Items.”
