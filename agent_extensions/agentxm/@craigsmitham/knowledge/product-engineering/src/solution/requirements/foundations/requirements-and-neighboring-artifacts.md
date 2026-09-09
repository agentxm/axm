---
type: Reference
title: Requirements and neighboring artifacts
description: Distinguishes requirements from goals, designs, plans, tests, evidence, and work items.
tags: [requirement, goal, design, use-case, test, evidence, work-item, pe-solution]
generated: { by: codex/gpt-5.6, at: 2026-08-29T20:06:39Z }
---

# Requirements and neighboring artifacts

A requirement states an obligation on an obligated subject under identified
conditions. It should not silently absorb the jobs of neighboring artifacts.

| Artifact | Primary question |
| --- | --- |
| Goal or outcome | Why is change valuable? |
| Use case or scenario | How does an actor reach an outcome at the boundary? |
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

A use case is the bridge from product meaning to observable behavior: it
describes an actor pursuing an outcome through interactions at a system
boundary, and so exposes candidate requirements. It is not the authoritative
statement of the underlying job, a complete set of requirements, an
implementation design, or evidence that the behavior creates value. Keep
preconditions, flows, outcomes, and exceptions at the behavioral boundary, and
move normative obligations into the project's accepted requirements form.

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
