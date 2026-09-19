---
type: Explanation
title: Value and demand model
description: How Offering, Audience, Need, Job to Be Done, and Value Proposition form an evidence-backed graph rather than a hierarchy.
tags: [product-management, offering, audience, needs, jobs-to-be-done, value-proposition, pe-problem]
status: draft
generated: { by: codex/gpt-6, at: 2026-09-09T17:14:14Z }
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

[Jobs to Be Done](../foundations/jobs-to-be-done.md) develops the research and
interpretations behind the job concept. [Value-based strategy](../foundations/value-based-strategy.md)
adds the economics of creating and sharing value; a value proposition alone
establishes neither the size nor the distribution of that value.

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

## Northbank: one offering, several relationships

[Northbank Equipment](../northbank-equipment.md) offers rental access to an
agreed capability and period, supported by preparation, delivery or collection,
and recovery. The portal is one part of that offering.

| Relationship to examine | Fictional candidate, not a research finding |
| --- | --- |
| Offering → audience | Dependable rental service for contractors coordinating a fixed crew start |
| Audience → need/job | A supervisor needs usable equipment at the right time; an administrator needs predictable commitments and charges |
| Proposition → alternatives | Dependable fulfillment may be preferable to another rental, ownership, borrowing, or rescheduling |
| Offering → another audience | Flexible pickup renters may value lower price more than reserve-backed recovery |
| Supplier/employee relationships | Better diagnostics and predictable shifts can improve the work through which the offering is delivered |

One contractor can have several needs, and one capability can help several
participants. The engineering manager's incident-coordination inquiry in
[JTBD](../foundations/jobs-to-be-done.md) concerns a different audience and
progress inside the same company. Neither inquiry is a child requirement of
the portal. The [outcome example](outcomes-and-evidence.md#northbank-follow-the-claim-through-the-evidence)
asks what would support the proposed value relationship.

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

## Continue exploring

- [Outcomes and evidence](outcomes-and-evidence.md) turns the value hypothesis
  toward observable results and the evidence supporting them.
- [Requirements and neighboring artifacts](../solution/requirements/foundations/requirements-and-neighboring-artifacts.md)
  explains what changes when product meaning becomes an accepted obligation.
- Follow [Value and evidence](../reading-product-engineering.md#value-and-evidence)
  for the wider reading route.
