---
type: Explanation
title: Goal-oriented behavior and use cases
description: How use cases connect actor goals and subject behavior to capabilities, interaction surfaces, domain authority, software responsibilities, dynamic views, and executable evidence.
tags: [use-cases, actors, goals, scenarios, extensions, features, capabilities, dynamic-views, architecture-views]
status: draft
sources:
  - id: use-case-foundation
    resource: https://alistaircockburn.com/Use%20Case%20Foundation.pdf
    title: Use Case Foundation
  - id: unifying-use-cases
    resource: https://alistaircockburn.com/Unifying%20us%20uc%20sm.pdf
    title: Unifying User Stories, Use Cases, Story Maps
  - id: cockburn-books
    resource: https://www.alistaircockburn.com/Books
    title: Alistair Cockburn — Books
generated:
  by: codex/gpt-5.6
  at: 2026-08-22T00:14:30Z
---

# Goal-oriented behavior and use cases

Architecture needs a behavioral view between demand and software structure:

> How does a subject behave so an external actor can achieve a goal, and which
> architectural responsibilities make that behavior possible?

A **use case** is the durable unit for answering that question. It connects why
a system matters to the abilities, interaction points, domain authority, and
software elements that realize its behavior. It is neither another value claim
nor a complete requirements repository.

```text
Audience, need, or job
          │ motivates
          ▼
       Use case ── exercises ──► Capability
          │
          ├── is enabled by ───► Feature
          ├── is enacted through ► Surface
          ├── uses authority from ► Bounded Context
          ├── is realized by ───► C4 elements
          └── has a scenario illustrated by ► C4 Dynamic View
```

These are many-to-many semantic relationships, not a containment hierarchy.

## A use case belongs to a subject boundary

A use case describes behavior of a named **subject** as observed through
interactions with actors outside that subject. The subject is normally an
offering or C4 software system in architecture documentation. A capability is
an ability the subject exercises, and a surface is where an actor encounters
behavior; neither should silently replace the subject boundary.

The Use Case Foundation describes a use case as a basic scenario and its known
extensions, with each scenario representing one complete path through the use
case.[^use-case-foundation] Architecture documentation adopts that shape while
keeping only the detail that changes durable architectural meaning.

## Actor is a contextual role

An **actor** is an external participant playing a role relative to one subject
and use case. A person, organization, device, or another software system may be
an actor. The role is contextual:

- the **primary actor** initiates the behavior to achieve a goal;
- a **supporting actor** or external service is called by the subject; and
- the same participant may play different roles in different use cases.

Actor is therefore not a required global concept type. An `Audience` concept
may play an actor role, and a `C4 Software System` may represent an external
system playing one. A use case may also name an actor role locally when no
independent audience or system concept passes the architecture admission test.

## Preserve a small, readable use-case shape

A maintained use case identifies:

1. the subject boundary;
2. the primary actor role;
3. the actor's goal and successful outcome;
4. a concise, technology-neutral main success scenario;
5. supporting actors or external services; and
6. extension conditions and handling that change architectural meaning.

The **main success scenario** is the ordinary path to the goal. An
**extension** begins with a condition that diverts from a step and states the
handling or resulting outcome. Listing conditions before elaborating their
handling helps reveal missing policy, state, recovery, and collaborator
responsibilities without turning the document into an exhaustive test
inventory.[^use-case-foundation]

Steps should express actor intent and subject responsibility. UI gestures,
protocol messages, component calls, data schemas, quality targets, and test
permutations belong in their better authorities unless one of them is itself
the durable architectural decision being explained.

## Use goal scope to control abstraction

Action verbs imply different durations and levels. Cockburn's goal-level model
separates strategic or summary goals, user goals, subfunctions, and smaller
delivery fragments; the relationships among them form a graph rather than a
strict tree.[^unifying-use-cases]

Use neutral labels in architecture documentation:

| Goal scope | Meaning | Guidance |
| --- | --- | --- |
| `summary` | A broader outcome spanning several user goals or interactions | Keep it as an overview or parent context; expand important user goals separately. |
| `user-goal` | A goal a primary actor expects to complete in one coherent interaction | Use this as the normal architecture use-case scope. |
| `subfunction` | A reusable or unusually complex subgoal supporting other use cases | Maintain it only when independent architectural meaning justifies the extra concept. |

An individual action or delivery-sized fragment is too small to become an
architecture use case. Keep it as a scenario step, requirement, user story, or
test owned by the corresponding authority.

## Keep adjacent concepts distinct

| Concept | Question it answers | Boundary from Use Case |
| --- | --- | --- |
| Audience | For which durable group are value, need, or interaction claims consequential? | An audience may play an actor role; Actor is contextual to one subject and goal. |
| Need | What problem, constraint, opportunity, or desired outcome matters independently of a solution? | A use case assumes a chosen subject and describes its behavior. |
| Job to Be Done | What progress is sought in particular circumstances? | A job explains demand; a use case explains interaction with a subject. |
| Actor | Who or what participates from outside the subject boundary? | Actor is a role inside the use-case context, not a global classification. |
| Goal | What result does the primary actor seek from this interaction? | Goal is required use-case meaning, not a separate profile concept. |
| Scenario | What one complete path occurs through the use case? | Main success and extension scenarios are selected paths through the use case. |
| Feature | What independently recognizable behavior is available across one or more use cases or surfaces? | Omit a feature that merely restates one use case. |
| User story or epic | What delivery conversation or slice should be tracked? | Delivery artifacts can slice a use case but do not replace its durable behavioral context. |
| Story map | How are delivery slices arranged by process and priority? | It is a collaborative planning view, not an architecture concept type. |
| C4 Dynamic View | How do selected software elements collaborate for one scenario? | It illustrates a scenario but does not own the use case or canonical elements. |

Cockburn explicitly distinguishes use cases, user stories, and story maps by
their purpose and recommends using them as complementary tools rather than
competing specifications.[^unifying-use-cases]

## Elaborate in response to value, risk, and learning

Start with the subject boundary and an actor-goal inventory. Expand user-goal
use cases whose value, risk, ambiguity, or architectural consequences justify
maintenance. Write the main path, list extension conditions, then elaborate
only the handling needed to clarify accepted behavior or responsibility.

Use representative scenarios to challenge candidate boundaries and discover
missing responsibilities. Spikes, walking skeletons, user stories, story maps,
and release slices may provide learning or delivery evidence, but they remain
in their own lifecycle. Architecture concepts link to their accepted results
rather than copying transient work state.[^cockburn-books]

## Trace selected scenarios through architecture

When ordering, collaboration, or responsibility allocation is consequential,
create a C4 Dynamic View for one named main or extension scenario. Identify:

- the originating use case and scenario;
- the initiating actor and intended outcome;
- the ordered interactions among canonical C4 elements;
- material state, policy, authority, or trust-boundary handoffs; and
- the recovery or terminal outcome for an extension scenario.

The use case owns the goal-oriented behavioral context. The dynamic view owns
the selected collaboration. Tests, requirements, contracts, and runtime
evidence own the exact cases and current facts they express better.

## Relationship to architecture documentation

The [Software architecture docs application profile for OKF
v0.2](../architecture-documentation/software-architecture-application-profile.md)
defines the `Use Case` type, its `use-cases/` path, body requirements, and the
author-facing relationship meanings used to connect architecture views. Use
the [Documenting use cases](../guides/documenting-use-cases.md) guide to create
one artifact and [Documenting C4 views](../guides/documenting-c4-views.md) to
illustrate a selected scenario.

## Related

- [Offerings and value in software architecture](offerings-and-value.md)
- [Capabilities in software architecture](capabilities.md)
- [C4 model](c4-model.md)
- [Reviewing responsibilities with scenarios](../guides/reviewing-responsibilities-with-scenarios.md)

[^use-case-foundation]: Use Case Foundation defines a use case through its
    basic scenario, extensions, actors, and paths to value while allowing the
    writing precision to vary.
[^unifying-use-cases]: Unifying User Stories, Use Cases, Story Maps separates
    stable goal-oriented behavioral context from delivery conversations and
    sequencing, and presents strategic goals, user goals, and subfunctions as
    a graph.
[^cockburn-books]: Alistair Cockburn's current book catalog identifies the
    sources used here for responsibility-oriented design and fine-grained
    incremental development.
