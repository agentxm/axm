---
type: Reference
title: Requirements and neighboring artifacts
description: Distinguishes requirements from goals, designs, plans, tests, evidence, and work items.
tags: [requirement, goal, design, use-case, test, evidence, work-item, pe-solution]
generated: { by: codex/gpt-6, at: 2026-09-09T15:53:30Z }
---

# Requirements and neighboring artifacts

A requirement states an obligation on an obligated subject under identified
conditions. It should not silently absorb the jobs of neighboring artifacts.

| Artifact | Primary question |
| --- | --- |
| Goal or outcome | Why is change valuable? |
| Use case | How can an actor pursue a goal at the boundary, through success and failure paths? |
| Scenario | What happens along one path through that interaction? |
| Requirement | What obligation must hold, for whom or what, and when? |
| Design or decision record | How will the obligation be realized, and why this approach? |
| Work item or plan | What coordinated activity will be performed? |
| Test or assessment | How will a claim be exercised or assessed in a context? |
| Evidence record | What was observed, for which target and revision? |

A requirement may constrain design when a genuine constraint exists, but an
implementation preference is not automatically a requirement. A test may
witness a requirement but does not become its authoritative wording. A work
item may change a requirement but does not own its durable identity unless the
project explicitly designates that host as authoritative.

A [use case](../../../foundations/use-cases.md) connects product meaning to
observable behavior through an actor's goal and the success and failure paths
at a chosen system boundary. It can expose candidate requirements or express
accepted behavioral requirements. It does not by itself establish the
underlying job, supply a complete set of requirements, determine internal
implementation, or provide evidence that the behavior creates value.

Normative obligations belong in the project's accepted requirements form.
That is an authority policy, not a requirement to translate every use case
into a separate set of sentences: the accepted form may be a use case whose
obligations satisfy the [requirement content
contract](../authoring/requirement-content-contract.md). Its identity, authority,
and supporting detail can be maintained through linked records. If project
policy instead requires separate requirement records, those records remain
authoritative and the use case links to them. Keep one normative authority
rather than two independently maintained copies. Cockburn's account explicitly
allows use cases to serve as behavioral requirements; the
[use-case explanation](../../../foundations/use-cases.md#connections-to-neighboring-concepts)
develops that relationship and its source basis.

## Where each artifact's portable craft lives

The requirement and the work item are the two artifacts this body of knowledge
treats portably end to end, and each has its own content contract, identity
rules, host mapping, and policy overlay. The pairs read alike because the
underlying craft is the same. They are not interchangeable, because the
artifacts are not.

| Concern | Requirement | Work item |
| --- | --- | --- |
| Content contract | [Requirement content contract](../authoring/requirement-content-contract.md) | [Work-item content contract](../../../delivery/work-items/common/work-item-content-contract.md) |
| Identity through change | [Maintaining requirement identity and lineage](../lifecycle/maintaining-requirement-identity-and-lineage.md) | [Maintaining work-item identity and relationships](../../../delivery/work-items/common/maintaining-identity-and-relationships.md) |
| Host mapping | [Mapping to requirements hosts](../adaptation/mapping-to-requirements-hosts.md) | [Mapping work items to native hosts](../../../delivery/work-items/common/mapping-to-work-item-hosts.md) |
| Local policy overlay | [Applying project-specific requirements policy](../adaptation/applying-project-specific-requirements-policy.md) | [Applying repository-specific work-item considerations](../../../delivery/work-items/common/applying-project-specific-considerations.md) |
| Verification | [Verification and validation](verification-and-validation.md) | [Defining work-item verification](../../../delivery/work-items/common/defining-verification.md) |

Choose by the artifact in hand. Neither column is a general treatment the other
specializes, and neither is a summary of the other. How the two artifacts
relate once both exist is covered by [Composing with work
management](../adaptation/composing-with-work-management.md).

## Continue exploring

- [Domain-driven design](../../../foundations/domain-driven-design.md) develops
  the language and models through which domain behavior is understood; the
  model does not confer requirement authority by itself.
- [Designing executable specifications](../../../engineering/designing-executable-specifications.md)
  explains how selected obligations gain readable examples and executable evidence.
- The [behavior and commitment route](../../../reading-product-engineering.md#behavior-and-commitment)
  connects these distinctions to actor goals, construction, and validation.
