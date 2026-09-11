# Service record

Use for a software responsibility with consumers, accountability, and lifecycle.
Apply the [common profile](../references/profile.md). The Type contract is
normative for profile 0.5.0; the remaining sections guide authoring.

## Type contract

A Service MUST identify purpose and consumers; responsibility and architecture
boundary; interfaces and material dependencies; accountability; source and
configuration authorities; intended operating contexts; operational observation,
response and escalation references; lifecycle, constraints, and maintenance
triggers. Identify architecture mapping when the meaning of service is ambiguous.
Do not assume one repository, one deployment, or one environment per service.

Every Service MUST include **Service levels**, defining objectives or explicitly
stating that none are established and why. Each objective MUST identify:

1. A stable service-local ID and covered behavior or user journey.
2. An inline measure definition or a link to a Measure, plus population,
   environment, target, evaluation window, and time semantics.
3. Rationale, responsible owner, and proposed, accepted, or aspirational state.
4. Effective date and acceptance authority when accepted.
5. Measurement/evaluation references, coverage limits, and response expectations
   or links to the relevant policy and guidance.

An inline measure MUST cover the [Measure type contract](measure.md#type-contract).
Extract it when independently reused or maintained; retain only one definition.
An alert threshold is not automatically an SLO. For event ratios, `1 - target`
is an event-fraction budget, not downtime unless the measure actually counts time.
SLA references MUST identify parties, covered subject, and agreement authority.
An SLO miss MUST NOT be labeled an SLA breach without evaluating the agreement.
Accepted definitions and targets MUST retain effective history. Link to a
requirements authority when it owns the obligation or threshold instead.

## Gather evidence

Inspect existing architecture and interface definitions, repositories,
configuration, accountability sources, accepted objectives, monitoring, and
response guidance. Distinguish design, intended placement, deployed observations,
and commitments. A green build does not establish service health or an SLO.
Common draft-gap allowances apply; do not invent numeric targets to fill a form.

## Suggested record

Add supported top-level relationship fields to the frontmatter using the
[relationship forms](../references/profile.md#relationships). Omit unknown
targets and name their gaps in the body.

```markdown
---
type: Service
title: <Recognizable software responsibility>
description: <Consumers, capability, and distinguishing scope>
status: draft
---

# <Recognizable software responsibility>

## Purpose and boundary
## Accountability and authoritative references
## Interfaces and dependencies
## Service levels
## Operation and response
## Lifecycle, gaps, and maintenance
```

Use `owned-by`, `source-in`, `depends-on`, `provided-by`, `uses-provider`, and
`runs-in` only where applicable. Keep SLO-to-measure and SLO-to-response links
within that objective so their applicability remains clear; no extra graph
relations or record types are required.

## Check and maintain

Can a reader establish what the service owns, who depends on it, where its
configuration lives, and how to interpret its objectives? Review boundary,
dependency, ownership, environment, objective, instrumentation, and response
changes. Reports must identify the definition and period being assessed.
