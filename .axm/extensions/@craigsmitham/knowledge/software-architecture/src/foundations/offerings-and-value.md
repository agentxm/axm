---
type: Explanation
title: Offerings and value in software architecture
description: How offerings connect audiences, needs, jobs to be done, and value propositions to goal-oriented behavior and architecture without forcing them into one product hierarchy.
tags:
  [
    offerings,
    value,
    audiences,
    needs,
    jobs-to-be-done,
    value-propositions,
    use-cases,
    capabilities,
    features,
    architecture-views,
  ]
status: draft
sources:
  - id: strategyzer-value-proposition
    resource: https://www.strategyzer.com/library/the-value-proposition-canvas
    title: Strategyzer — The Value Proposition Canvas
  - id: productboard-hierarchy
    resource: https://support.productboard.com/hc/en-us/articles/360058212253-Build-your-product-hierarchy
    title: Productboard — Build your product hierarchy
  - id: goal-oriented-behavior
    resource: goal-oriented-behavior.md
    title: Goal-oriented behavior and use cases
generated:
  by: codex/gpt-5.6
  at: 2026-08-21T22:12:04Z
---

# Offerings and value in software architecture

Architecture needs a view that begins before system behavior and structure:

> Who is this for, what matters to them, and what coherent value is being made
> available?

This demand-and-value view connects an organization's accepted purpose to the
capabilities, features, domain models, interaction surfaces, and software
elements that realize it. It is useful for internal platforms, public services,
open-source systems, and commercial products alike. It does not turn
architecture documentation into a roadmap, customer-research repository, or
marketing site.

This explainer is the comparative authority for the demand-and-value family:
offering, audience, need, Job to Be Done, and value proposition. Each concept
can have a focused document that owns its detailed evidence and meaning; this
document owns how the family differs and relates to neighboring architecture
views. [Goal-oriented behavior and use cases](goal-oriented-behavior.md) owns
the adjacent behavioral model that connects actor goals to a chosen
subject.[^goal-oriented-behavior]

## Use offering as the neutral anchor

An **offering** is a coherent unit of value intentionally made available to one
or more audiences. It may be a product, service, platform, program, shared
facility, or combination of people, process, and software. The term does not
imply a price, purchaser, legal product boundary, or independent software
system.

For example, an internal developer platform can be an offering to engineering
teams, and a public benefits service can be an offering to residents, even
though neither is primarily a commercial product. A commercial product can
also contain several offerings or participate in one offering with human and
operational services.

An offering is therefore not automatically:

- the root of every architecture concept;
- a C4 software system;
- a deployable application;
- a feature collection;
- a business capability; or
- a delivery initiative.

Use a specific local term such as _product_, _service_, or _platform_ in the
title when it is the accepted name. Use `Offering` as the common concept type
that lets the corpus represent those cases consistently.

## Five complementary concepts

| Concept           | Question it answers                                                                           | Important boundary                                                            |
| ----------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Offering          | What coherent value is intentionally made available?                                          | It is not necessarily a commercial product or software boundary.              |
| Audience          | For whom is the offering, need, claim, or interaction consequential?                          | It is a durable group, not a named person or a research persona.              |
| Need              | What problem, constraint, opportunity, or desired outcome exists independently of a solution? | It does not prescribe a feature or implementation.                            |
| Job to Be Done    | What progress is an audience seeking in particular circumstances?                             | It is a demand-side lens, not a system capability or use-case flow.           |
| Value Proposition | Why should an audience expect an offering to address a need or job?                           | It is a scoped, evidence-bearing promise, not proof that an outcome occurred. |

### Audience

An **audience** is a durable group for whom an offering, need, value claim, or
interaction is relevant. Audiences can be external or internal and can include
users, operators, purchasers, sponsors, partners, maintainers, or beneficiaries.

Those labels are contextual roles, not permanent classifications. One audience
may operate an offering, benefit from another, and sponsor a third. State the
role in the relevant prose rather than assigning one global `audience_role`.

An audience is not a persona. Personas, interview participants, accounts, and
segments can supply evidence, but they often contain research detail,
temporally sensitive assumptions, or private information that should not become
canonical architecture concepts.

### Need

A **need** is a problem, constraint, opportunity, or desired outcome that
matters to an audience without assuming a particular response. _Preserve a
scarce capacity commitment while plans are finalized_ is a need; _add a hold
button_ is a proposed feature.

Needs can remain useful when the implementation, channel, or offering changes.
They should be supported by accepted authority or evidence when they make
consequential claims about an audience.

### Job to Be Done

A **Job to Be Done** describes progress that an audience seeks in particular
circumstances. The [Jobs to Be Done](jobs-to-be-done.md) foundation owns the
theory, evidence expectations, forces-of-progress model, job mapping, and its
boundaries from needs, use cases, capabilities, and solution structure. Here,
the job is one demand concept that an offering and value proposition may
address.

### Value Proposition

A **value proposition** is a scoped promise that an offering will create
relevant benefit for an audience by addressing particular needs or jobs.
Strategyzer's Value Proposition Canvas similarly connects customer jobs, pains,
and gains with components of an offering that relieve pain or create
gain.[^strategyzer-value-proposition]

A value proposition belongs to an offering-and-audience context. The same
offering can make different promises to travelers, operators, sponsors, or
partners. A proposition should distinguish intended benefit from measured
outcome and should identify evidence and limitations for material claims.

## Relate the model instead of nesting it

The concepts generally have many-to-many relationships:

- an offering can serve several audiences;
- an audience can have several needs and jobs;
- a need or job can be addressed by several offerings;
- an offering can support several value propositions for different audiences;
- an audience may play an actor role in several use cases; and
- several use cases, capabilities, features, contexts, or software elements
  can help an offering address its demand and value claims.

A physical tree cannot represent all of these relationships truthfully.
Product-management tools often use a product-component-feature hierarchy to
organize planning work, and Productboard explicitly permits organization by
stable user need or product area.[^productboard-hierarchy] That is useful for a
planning workspace, but it should not become the universal semantic hierarchy
for architecture documentation.

Keep offering, audience, need, job, and proposition concepts in sibling
collections under `value/`. Keep use cases in their behavioral collection and
use explicit prose links to connect the views. An offering document or index
may curate related concepts as a reader view without owning or duplicating
them.

## Keep neighboring architecture views distinct

| View                             | Question                                                              | Relationship to demand and value                                                                                      |
| -------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Outcome or goal                  | What result is desired?                                               | A need or job can name desired progress; an outcome is not the offering or its capability.                            |
| Use case                         | How does a subject behave so an external actor can achieve a goal?    | A use case connects demand to a chosen subject; it is behavior, not a value claim.                                    |
| Capability                       | What must an identified bearer be able to do?                         | Capabilities provide abilities that help offerings address needs and jobs.                                            |
| Feature                          | What recognizable behavior is available to an actor?                  | Features make part of an offering concrete but do not define its complete value.                                      |
| Surface                          | Where does an actor encounter behavior?                               | Surfaces expose features and use cases through applications, APIs, devices, protocols, or consoles.                   |
| DDD subdomain or bounded context | What problem knowledge matters, and where does a model apply?         | Domain concepts govern meaning, rules, and state used to provide value.                                               |
| C4 element                       | What software structure realizes behavior?                            | Systems, containers, and components may realize several offerings, capabilities, and use cases.                       |
| Wardley map                      | What depends on what, for whose need, and at what stage of evolution? | A map can position audiences, needs, offerings, capabilities, or realizations as strategic hypotheses.                |
| Delivery work                    | What change is proposed, prioritized, or being delivered?             | Initiatives, releases, stories, and feature requests have a delivery lifecycle outside accepted architecture meaning. |

No view is the parent taxonomy for all the others. Preserve one canonical
document for each maintained concept and connect views where the relationship
is consequential.

## Share meaning across channels without copying authority

Architecture, product management, marketing, sales, support, and public
documentation can use the same accepted definitions while presenting different
projections:

- architecture emphasizes boundaries, capabilities, domain authority,
  realization, constraints, and evidence;
- product management emphasizes discovery, prioritization, outcomes, and
  delivery choices;
- marketing and public documentation emphasize relevant audience language,
  benefits, supported behavior, and limitations; and
- sales or service teams emphasize fit, qualification, adoption, and the
  evidence for claims.

The architecture corpus owns durable semantic meaning only when it is the
accepted authority for that meaning. It should link to current availability,
pricing, roadmap, campaigns, customer records, research repositories, or
operational measures rather than copying them. Channel-specific wording is a
projection, not a second canonical definition.

## Admit evidence-bearing concepts, not a complete catalog

Create one of these concepts only when it preserves accepted, consequential,
durable meaning that is difficult to infer reliably and worth maintaining.
In particular:

- support audience, need, job, and value claims with truthful sources;
- give time-sensitive claims a review boundary;
- exclude named customers, interview participants, private personas, and other
  non-public information from a public corpus;
- keep tentative discoveries and proposed value claims in their own lifecycle;
- keep offering availability and performance in live authorities; and
- avoid creating every possible audience, need, or proposition for symmetry.

## Example: reservation platform

A reservation platform may be an **Offering** to travelers and reservation
operators. Travelers are one **Audience** with the **Need** to rely on scarce
capacity remaining available while they complete a decision. In circumstances
where plans are still uncertain, their **Job to Be Done** may be _help me secure
capacity without worrying that it will disappear during checkout_.

The platform's traveler-facing **Value Proposition** is that an accepted hold
creates a dependable, time-bounded opportunity to confirm. The neighboring
behavioral view can document _Confirm a reservation_ as a **Use Case** in which
a traveler pursues that goal through the platform.

Reservation-management capabilities, a saved-traveler-details feature,
checkout surfaces, reservation and inventory bounded contexts, and several C4
elements all participate. They describe the same situation from different
views without becoming children of the offering.

## Relationship to architecture documentation

The [corpus-organization guide](../guides/organizing-an-architecture-docs-corpus.md)
explains when to create the `value/` collections, how to keep their five
concept sets adjacent without implying containment, and how to connect them to
the separate `use-cases/` collection and other architecture views.

The [Software architecture docs application profile for OKF
v0.2](../architecture-documentation/software-architecture-application-profile.md)
defines the exact `Offering`, `Audience`, `Need`, `Job to Be Done`, and `Value
Proposition` types alongside the behavioral and structural profile types. The
[goal-oriented behavior](goal-oriented-behavior.md) foundation owns the Use
Case boundary and author-facing relationship meanings. Relationship
frontmatter remains deferred; ordinary Markdown links and explicit prose carry
those meanings.

Use the focused guides for [offerings](../guides/documenting-offerings.md),
[audiences](../guides/documenting-audiences.md),
[needs](../guides/documenting-needs.md), [Jobs to Be
Done](../guides/documenting-jobs-to-be-done.md), [value
propositions](../guides/documenting-value-propositions.md) when authoring one
demand-or-value artifact. Use [Documenting use
cases](../guides/documenting-use-cases.md) for goal-oriented behavior.

## Related

- [Capabilities in software architecture](capabilities.md)
- [Goal-oriented behavior and use cases](goal-oriented-behavior.md)
- [Jobs to Be Done](jobs-to-be-done.md)
- [Domain-driven design](domain-driven-design.md)
- [C4 model](c4-model.md)
- [Wardley mapping](wardley-mapping.md)

[^strategyzer-value-proposition]:
    Strategyzer's Value Proposition Canvas links
    customer jobs, pains, and gains with the offering elements intended to
    relieve pains and create gains.

[^productboard-hierarchy]:
    Productboard documents a planning hierarchy in which
    product components may be organized by stable user need or product area and
    contain features and subfeatures.

[^goal-oriented-behavior]:
    Goal-oriented behavior and use cases separates the
    demand-and-value family from subject behavior while defining their
    consequential relationships.
