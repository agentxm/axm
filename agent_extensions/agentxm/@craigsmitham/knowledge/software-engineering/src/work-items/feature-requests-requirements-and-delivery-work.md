---
type: Explanation
title: Feature requests, requirements, and delivery work
description: How source requests, normalized feature requests, accepted requirements, and delivery work differ in evidence, authority, maturity, and tracker representation.
tags: [feature-request, customer-request, stakeholder-need, requirement, product-discovery, delivery-work, traceability, request-intake, work-item]
status: draft
sources:
  - id: iso-29148
    resource: https://www.iso.org/standard/72089.html
    title: ISO — ISO/IEC/IEEE 29148:2018 Requirements engineering
  - id: incose-requirements
    resource: https://portal.incose.org/ItemDetail?Category=EBOOKS&WebsiteKey=d4c31fa4-467a-4959-b48b-cae3ea93e516&iProductCode=GUIDEWRITESUMM
    title: INCOSE — Guide to Writing Requirements summary sheet
  - id: github-issue-types
    resource: https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/managing-issue-types-in-an-organization
    title: GitHub Docs — Managing issue types in an organization
  - id: jira-ideas
    resource: https://www.atlassian.com/software/jira/product-discovery/guides/ideas/overview
    title: Atlassian — Jira Product Discovery ideas overview
  - id: jira-delivery
    resource: https://www.atlassian.com/software/jira/product-discovery/guides/delivery/overview
    title: Atlassian — Jira Product Discovery delivery overview
  - id: linear-customer-requests
    resource: https://linear.app/docs/customer-requests
    title: Linear Docs — Customer Requests
  - id: azure-work-items
    resource: https://learn.microsoft.com/en-us/azure/devops/boards/work-items/about-work-items
    title: Microsoft Azure Boards — About work items and work item types
  - id: scrum-guide
    resource: https://scrumguides.org/scrum-guide.html
    title: The Scrum Guide
generated:
  by: codex/gpt-5
  at: 2026-08-21T21:30:41Z
---

# Feature requests, requirements, and delivery work

A **feature request** records a desire for new or changed functionality so it
can be understood, related to other evidence, and evaluated. Filing one proves
that a request was expressed. It does not by itself prove the underlying need,
the request's value or necessity, the correctness of its proposed solution, or
an obligation to deliver it.

The word **request** is therefore load-bearing. A request may inform a product
or requirements decision without already being that decision.

## Source requests and normalized feature requests

Two records are commonly called a feature request:

| Record | What it preserves | Typical relationship |
| --- | --- | --- |
| **Source request occurrence** | One attributable expression of feedback, demand, or desired change in its original context | May be linked with other occurrences to one issue, idea, or opportunity |
| **Normalized feature request** | A durable, product-oriented statement of an affected context, current limitation, and desired outcome | May synthesize several occurrences and later support several requirements or delivery items |

Some hosts represent these as separate objects. Linear, for example, links
customer requests and their source context to issues or projects, while Jira
Product Discovery uses ideas that may represent problems, opportunities,
solutions, or feature requests.[^linear-customer-requests][^jira-ideas] Other
hosts keep both layers in one issue. The container may vary, but the source and
the synthesis should remain distinguishable and traceable.

A normalized request may reframe a proposed mechanism around the underlying
need. That is analysis, not permission to overwrite what the source actually
said. Preserve the source occurrence or an authoritative link to it.

## Need, requirement, and delivery authority

These concepts answer different questions:

| Concept | Main claim | Authority or maturity |
| --- | --- | --- |
| Source request occurrence | Someone expressed this feedback or desired change in this context | Attributed input |
| Normalized feature request | This new or changed outcome is worth evaluating | Intake awaiting a decision |
| Need, problem, or opportunity | This stakeholder condition or outcome may warrant a response | Analyzed understanding, with uncertainty still possible |
| Requirement | The accepted solution is obligated to provide this capability, quality, or constraint | Approved basis for design, validation, or agreement |
| Feature or capability | The product provides or may provide a recognizable ability | Granularity and approval state depend on the host |
| Delivery item | The organization uses this artifact to plan or track accepted work | Host-specific planning and execution authority |
| Task | Perform this action | Execution rather than the need or outcome |

Initial stakeholder concerns are not automatically well-formed requirements.
Requirements engineering transforms needs through analysis, agreement, and
validation before treating them as obligations.[^iso-29148] A user story,
Product Backlog Item, feature, or issue may represent a requirement or delivery
unit in one host and something less mature in another; its label alone does not
establish authority.

## Request, decision, and delivery relationships

The lifecycle is a network, not a ticket conversion pipeline:

```text
Source request or observation
        │
        ├── combined with other source evidence
        ▼
Normalized need, problem, opportunity, or feature request
        │
        ├── decline, defer, investigate, validate, or accept
        ▼
Accepted outcome, requirement, or solution decision
        │
        ├── one-to-many and many-to-one relationships
        ▼
Host-specific delivery items and tasks
        │
        └── production evidence may reopen an earlier conclusion
```

Several request occurrences may support one normalized opportunity. One broad
request may produce several requirements and delivery items. One accepted
capability may also address several needs. Preserve these relationships rather
than rewriting the original request as though it had always been the accepted
specification.

Discovery and delivery can overlap, and learning continues after release. Jira
Product Discovery describes an explicit boundary between uncertain ideas and
committed delivery tickets while also cautioning that discovery and delivery
are continuous rather than perfectly linear.[^jira-delivery]

## Quality changes with maturity

Useful rigor is proportional to the artifact's lifecycle state:

| State | Appropriate quality expectations |
| --- | --- |
| Source request occurrence | Attributable, faithfully preserved, understandable in context, and explicit about uncertainty |
| Normalized need or feature request | Traceable to sources, appropriately abstract, coherent enough to evaluate, and explicit about evidence, assumptions, conflicts, and proposed solutions |
| Individual accepted requirement | Necessary, appropriate, unambiguous, complete, singular, feasible, verifiable, correct relative to its source need, and conforming to the applicable requirement style |
| Accepted requirement set | Complete and consistent as a set, feasible within constraints, comprehensible, and able to be validated against stakeholder needs |
| Delivery item | Traceable to its authority, sufficiently refined for its planning horizon, and clear about verification conditions without confusing them with testing strategy |

The requirement characteristics are useful after a need has been transformed
into an obligation; applying every characteristic as an intake gate would
suppress uncertain but valuable signals and encourage reporters to invent
analysis. INCOSE likewise distinguishes well-formed needs, requirements, sets,
and their associated attributes rather than treating them as one artifact
class.[^incose-requirements]

## Why tracker labels do not settle the distinction

Current hosts use related terms at different levels:

| Host vocabulary | What it establishes |
| --- | --- |
| GitHub `Feature` | A default issue type alongside Bug and Task; it does not encode a universal maturity level |
| Jira Product Discovery `Idea` | A problem, opportunity, solution, or feature request that may link to one or more delivery tickets |
| Linear `Customer Request` | Source feedback linked to an issue or project |
| Azure `Feature` | A portfolio item that groups requirement-level work items in the default hierarchy |
| Scrum Product Backlog Item | An item in the emergent, ordered Product Backlog; its form and detail evolve through refinement |

GitHub and Azure use `Feature` at different levels of their respective models.
[^github-issue-types][^azure-work-items] Scrum attaches the Product Backlog's
commitment to the Product Goal, not to a promise that every individual backlog
item will be delivered exactly as first recorded. Items selected with the
Sprint Goal and delivery plan form the Sprint Backlog.[^scrum-guide]

Portable guidance can therefore name the semantic artifact while allowing the
host to supply its concrete issue type, hierarchy, and commitment rules.

## Need before solution

Stakeholders often describe the solution they can imagine: “add an export
button” or “support a webhook.” The proposal is useful input, but it should not
replace who is affected, what they cannot accomplish, and which outcome they
seek. Preserving that distinction leaves room for a smaller, safer, or more
general response.

This does not make solution ideas forbidden. It makes their authority visible:
the source owns what was requested, the normalized request owns the evaluable
need and outcome, and an accepted requirement or design owns the chosen
obligation or mechanism.

## Choosing another artifact

Use a different work item when:

- existing behavior may violate an accepted expectation — write a
  [defect report](failures-defects-and-defect-reports.md);
- service impact requires coordinated response — create an
  [operational incident record](operational-incident-records.md);
- only uncertainty reduction has been authorized — create an investigation;
  or
- behavior, scope, and delivery authority are already accepted — create the
  host's applicable requirement, delivery item, or task and link the request
  evidence as provenance.

For the recording procedure and tracker-ready template, see
[Recording feature requests](recording-feature-requests.md).

[^azure-work-items]: Microsoft Azure Boards, “About work items and work item types.”
[^github-issue-types]: GitHub Docs, “Managing issue types in an organization.”
[^incose-requirements]: INCOSE, “Guide to Writing Requirements summary sheet.”
[^iso-29148]: ISO/IEC/IEEE 29148:2018, requirements-engineering processes and requirement characteristics.
[^jira-delivery]: Atlassian, “Jira Product Discovery delivery overview.”
[^jira-ideas]: Atlassian, “Jira Product Discovery ideas overview.”
[^linear-customer-requests]: Linear Docs, “Customer Requests.”
[^scrum-guide]: Schwaber and Sutherland, “The Scrum Guide,” November 2020.
