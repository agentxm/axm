---
name: modularize
description: Modularize a codebase or a specified part around cohesive responsibilities that can evolve independently.
disable-model-invocation: true
---

Modularize the requested scope around cohesive responsibilities, so changes
to one concern have limited effects on unrelated concerns.

For opportunity questions, assess candidates and their tradeoffs without
implementing them. For change requests, carry the requested outcome through
implementation and verification within the authorized scope.

Keep knowledge and decisions that change for the same reasons together,
and allow independently changing policies to evolve separately.
Responsibilities should have clear owners and simple interfaces that expose
only what collaborators need.

Keep domain policy independent of delivery and infrastructure details, and
reusable capabilities independent of their consumers' specialized policies.
Dependencies and boundary contracts should preserve those separations, with
translation and composition owned by integrations. Resolve dependency cycles
and model leakage that prevent responsibilities from evolving independently.

Establish intended uses, applicable requirements, affected consumers, and
representative changes that currently spread across responsibilities. Choose
a bounded intervention whose benefit justifies migration, coupling, and
ongoing ownership costs. Establish evidence sufficient to preserve required
behavior while changing structure; keep intentional behavior changes
distinguishable from restructuring.

The result should make representative changes more local, without unnecessary
layers or fragmentation. Demonstrate the improvement through concrete change
scenarios, dependency reasoning, or other appropriate evidence; file and
interface counts alone do not establish independence.

Complete affected integrations, configuration, tests, documentation, and
ownership guidance. Remove transitional boundaries when their obligations end,
or identify remaining consumers and exit conditions. Where justified, protect
the boundary through a proportionate check or explicit ownership.

Report evidence for the claimed improvement, material costs and tradeoffs,
and remaining uncertainty. Let intended uses and reasons for change determine
the boundaries; retain the existing structure when intervention is unwarranted.
