---
type: Explanation
title: Jobs to Be Done
description: How Jobs to Be Done explains demand as progress sought in particular circumstances, and how jobs relate to needs, offerings, use cases, capabilities, domain meaning, and software structure.
tags: [jobs-to-be-done, jtbd, demand, progress, circumstances, forces-of-progress, job-mapping, architecture-views]
status: draft
sources:
  - id: christensen-jtbd
    resource: https://www.christenseninstitute.org/theory/jobs-to-be-done/
    title: Christensen Institute — Jobs to Be Done Theory
  - id: christensen-forces
    resource: https://www.christenseninstitute.org/publication/teachers-jobs-to-be-done/
    title: Christensen Institute — The teacher's quest for progress
  - id: customer-centered-innovation-map
    resource: https://hbr.org/2008/05/the-customer-centered-innovation-map
    title: Harvard Business Review — The Customer-Centered Innovation Map
  - id: goal-oriented-behavior
    resource: goal-oriented-behavior.md
    title: Goal-oriented behavior and use cases
generated:
  by: codex/gpt-5.6
  at: 2026-08-26T19:12:18Z
---

# Jobs to Be Done

> **Authority:** The [Gen Stack vocabulary and relationship
> model](/glossary.md) is authoritative for canonical terms and relationships.
> This Explanation develops understanding without redefining them. When it
> discusses a profile-governed corpus representation, the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) governs that representation.
> This document adds neither semantic authority nor profile-conformance rules.

Jobs to Be Done (JTBD) is a demand-side way to understand why people or
organizations seek, choose, retain, replace, or reject a response. Its central
question is:

> What progress is someone trying to make in particular circumstances?

A **Job to Be Done** describes that sought progress without assuming the
product, service, process, feature, or software structure that will enable it.
The circumstances matter because the same person may seek different progress
at different times, while people with different characteristics may seek the
same progress in comparable circumstances.[^christensen-jtbd]

This makes JTBD useful to software architecture when durable demand should
inform capabilities, domain models, system responsibilities, and structural
choices. It does not make customer research or product strategy subordinate to
architecture.

## A family of related practices

JTBD is not one standardized notation or schema. Related approaches emphasize
different, compatible questions:

- **choice and causality** examine the circumstances and forces that lead
  someone to adopt or reject a response;
- **progress and experience** consider functional, social, and emotional
  dimensions of the progress sought; and
- **job and outcome mapping** decompose what someone is trying to accomplish
  independently of the current solution and identify where better outcomes
  are possible.[^customer-centered-innovation-map]

Choose the approach that answers a present question. Do not require every job
document to contain a forces analysis, job map, outcome inventory, and journey
merely because each can be useful.

## Progress occurs in circumstances

A useful job joins two ideas:

- **circumstances** — the situation, constraints, prior events, available
  alternatives, and struggling moment in which demand arises; and
- **progress** — the change toward a goal or aspiration that the actor is
  trying to make.

Functional, social, and emotional dimensions can all affect that progress.
They are lenses for understanding one job, not three mandatory job types. A
technically effective response may still be rejected when it creates an
unacceptable experience, identity, or social consequence.

The forces-of-progress model provides another lens on a change of response:

| Force | Question |
| --- | --- |
| Push of the present | What makes the current situation no longer acceptable? |
| Pull of a new response | What promised progress makes an alternative attractive? |
| Habit of the present | What makes the existing response easier to keep? |
| Anxiety about change | What risk or uncertainty makes a new response difficult to adopt? |

Push and pull encourage change; habit and anxiety resist it. These forces are
research findings about a choice in context, not permanent attributes of an
audience.[^christensen-forces]

## State jobs without prescribing solutions

A job statement should name the actor or audience, sought progress, and
material circumstances in language that can survive changes in offerings and
implementation. For example:

> Help a traveler secure scarce capacity while plans are uncertain, without
> committing irreversibly too early.

Templates such as *When …, I want to …, so I can …* can help expose context,
motivation, and outcome. The template is not the theory, and its middle clause
should not smuggle in a preferred feature or interaction. *When capacity is
scarce, I want a hold button* specifies a response; it does not yet explain the
underlying progress.

A credible job is discovered from evidence about actual choices, constraints,
and alternatives. It is not made true by writing a plausible sentence. Record
the evidence and its limitations, distinguish hypothesis from accepted
meaning, and revisit a job when the relevant circumstances or evidence change.

## Job maps are not journeys

A **job map** decomposes the job independently of a particular solution. The
customer-centered innovation map uses the broad stages *define, locate,
prepare, confirm, execute, monitor, modify,* and *conclude* to find unmet
outcomes across a job.[^customer-centered-innovation-map] The useful point is
the solution-independent sequence, not compulsory use of eight headings.

A current-state journey or process map instead records what actors or systems
do through a particular response. A use case explains goal-oriented
interaction with a chosen subject. These artifacts can inform one another, but
substituting a current workflow for the job makes existing behavior look like
the demand itself.

## Keep neighboring architecture concepts distinct

This table keeps the concepts most likely to be mistaken for a job close to
the JTBD explanation. [Offerings and value in software
architecture](offerings-and-value.md) owns the wider comparison among
offerings, audiences, needs, jobs, and value propositions. [Goal-oriented
behavior and use cases](goal-oriented-behavior.md) owns the adjacent Actor,
Goal, Use Case, Scenario, Feature, and User Story distinctions.[^goal-oriented-behavior]

| Concept | Question | Relationship to a job |
| --- | --- | --- |
| Audience | For whom is a claim or interaction consequential? | The audience identifies who seeks progress; demographics or roles alone do not define the job. |
| Need | What problem, constraint, opportunity, or desired outcome matters? | A need can exist without the circumstances-and-progress framing of a job. JTBD does not replace every useful kind of need. |
| Use case | How does a chosen subject behave so an actor can achieve a goal? | A use case describes goal-oriented behavior; a job explains the demand that may motivate it. |
| Capability | What must an identified bearer be able to do? | Capabilities are provider-side abilities that may enable progress on several jobs. |
| Feature or surface | What behavior is available, and where is it encountered? | Features and surfaces are parts of a response, not the job itself. |

These relationships are generally many-to-many. A job can require several
capabilities and use cases; one capability or offering can contribute to
several jobs. Preserve explicit links instead of turning the views into one
containment hierarchy.

## Use jobs selectively in architecture documentation

An Gen Stack corpus should contain a job only when it preserves accepted,
consequential, durable demand meaning that architecture decisions need and
that cannot be inferred reliably from features or code. A maintained job can
explain:

- the audience and circumstances in which the job arises;
- the progress sought and material functional, social, or emotional forces;
- exclusions that distinguish it from neighboring jobs or needs;
- the evidence and confidence supporting the claim; and
- consequential relationships to offerings, value propositions, use cases,
  capabilities, domain authorities, and structural realization.

Keep interview records, named participants, personas, segmentation analyses,
survey data, and tentative opportunity assessments in their appropriate
research authority. Keep roadmap choices and proposed responses in product or
delivery authorities. Architecture documentation should link to that evidence
without copying private or time-sensitive research into a public corpus.

## Relationship to architecture guidance

[Offerings and value in software architecture](offerings-and-value.md) places
jobs within the wider demand-and-value model. [Capabilities in software
architecture](/architecture/capabilities/capabilities.md) distinguishes demand-side jobs from
provider-side abilities. [Goal-oriented behavior and use
cases](goal-oriented-behavior.md) explains how a job may motivate interaction
with a chosen subject without becoming the use case itself.

The [Gen Stack application
profile for OKF v0.2](../profile/gen-stack-application-profile.md)
defines the exact `Job to Be Done` type, common frontmatter, canonical path,
and profile-validation rules. This Explanation and the focused guide own the
deeper conceptual and authoring treatment without adding conformance rules.

Use [Documenting Jobs to Be
Done](documenting-jobs-to-be-done.md) to create one maintained job
concept.

## Related

- [Offerings and value in software architecture](offerings-and-value.md)
- [Capabilities in software architecture](/architecture/capabilities/capabilities.md)
- [Domain-driven design](/architecture/domains/domain-driven-design.md)
- [C4 model](/architecture/structure/c4-model.md)
- [Wardley mapping](wardley-mapping.md)

[^christensen-jtbd]: Christensen Institute defines a job as progress sought
    toward a goal or aspiration in particular circumstances and emphasizes
    functional, social, and emotional dimensions.
[^christensen-forces]: Christensen Institute's teacher research applies push,
    pull, habit, and anxiety to explain adoption decisions and resistance.
[^customer-centered-innovation-map]: Bettencourt and Ulwick distinguish a
    solution-independent job map from the process or activities a current
    solution causes someone to perform.
[^goal-oriented-behavior]: Goal-oriented behavior and use cases distinguishes
    demand-side progress from interaction with a chosen subject and from
    delivery-sized behavioral slices.
