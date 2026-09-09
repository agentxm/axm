---
type: Explanation
title: Value and demand model
description: How Offering, Audience, Need, Job to Be Done, and Value Proposition form an evidence-backed graph rather than a hierarchy.
tags: [product-management, offering, audience, needs, jobs-to-be-done, value-proposition, pe-problem]
status: draft
generated:
  by: claude/opus-5
  at: 2026-09-08T00:00:00Z
---

# Value and demand model

Five concepts provide a compact vocabulary for explaining product value and
demand. They are distinct because each answers a different question:

| Concept | Question answered | Typical evidence |
| --- | --- | --- |
| **Offering** | What coherent product, service, platform, or capability is made available? | Product boundary, usage, delivery and support reality |
| **Audience** | Which people or organizations share relevant circumstances? | Research participants, observed behavior, market or operational data |
| **Need** | What desired state or problem matters to that audience? | Observations, interviews, workarounds, incidents, unmet outcomes |
| **Job to Be Done** | What progress is someone trying to make in a circumstance? | Contextual inquiry, switching behavior, forces for and against change |
| **Value Proposition** | Why should an audience expect an offering to help with a need or job, compared with alternatives? | Choice, adoption, retention, willingness to pay or change, outcome evidence |

This vocabulary is intentionally independent of artifact types and delivery
lifecycle rules.

## Common failures

Each concept has one failure that spoils it more often than any other, and each
one is a solution, a label, or a claim wearing the concept's name:

| Concept | Common failure |
| --- | --- |
| **Offering** | Naming a feature or internal component as if it were a complete offering |
| **Audience** | Demographics or role labels with no relevance to the decision |
| **Need** | Restating a preferred solution as a need |
| **Job to Be Done** | Writing a task list or product interaction |
| **Value Proposition** | An unsupported slogan or generic benefit |

## A graph, not a hierarchy

The concepts form a many-to-many graph:

- an Offering may serve several Audiences;
- an Audience may have several Needs and Jobs;
- a Need may be shared across Audiences;
- a Job may expose several related Needs;
- a Value Proposition connects an Offering to a particular Audience, Need, or
  Job in a particular competitive context.

Do not force every concept into a tree or assume an Offering contains an
Audience. Keep relationships explicit enough that evidence can confirm,
refine, or contradict them.

## Meaning before commitment

The five concepts express product meaning, not implementation commitment. They
help a team decide what is worth pursuing and which assumptions need evidence.
They do not by themselves specify required behavior, authorize work, or prove
that value exists.

Treat each concept and relationship as having a maturity such as candidate,
supported, contested, or retired. A polished name does not make an assertion
true. Preserve contrary evidence, record material uncertainty, and revisit the
model when actual choice or outcomes differ from expectations.

## Neighboring concerns

[Where to play](../strategy/) owns choices about participation, advantage,
capabilities, and value creation. This section applies those choices by forming
and testing product meaning.
[What to build](../solution/) owns normative statements about what a system or
service must achieve, and the handoff from product meaning to a requirement;
realization choices belong to [How to build it](../engineering/). The record
used to coordinate a change is owned by
[Work items](../delivery/work-items/) in How to ship it.

These boundaries are about authority, not isolation. One initiative may draw
on all of them, provided links do not silently transfer authority from one
artifact to another.
