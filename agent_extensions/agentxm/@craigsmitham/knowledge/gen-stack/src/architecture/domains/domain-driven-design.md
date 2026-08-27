---
type: Explanation
title: Domain-driven design
description: How domain models, language, strategic boundaries, and tactical modeling patterns work together to address complex software domains without prescribing one system structure.
tags: [domain-driven-design, domain-modeling, ubiquitous-language, subdomains, bounded-contexts, context-map, entities, value-objects, aggregates, domain-events, repositories]
status: draft
sources:
  - id: evans-ddd-reference
    resource: https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf
    title: Eric Evans — Domain-Driven Design Reference
  - id: ddd-crew-bounded-context-canvas
    resource: https://github.com/ddd-crew/bounded-context-canvas
    title: DDD Crew — Bounded Context Canvas
  - id: context-mapper-subdomains
    resource: https://contextmapper.org/docs/subdomain/
    title: Context Mapper — Domain and Subdomain
  - id: context-mapper-bounded-contexts
    resource: https://contextmapper.org/docs/bounded-context/
    title: Context Mapper — Bounded Context
  - id: context-mapper-architecture-validation
    resource: https://contextmapper.org/docs/architecture-validation-with-archunit/
    title: Context Mapper — Validating the Implementation against the Model
generated:
  by: codex/gpt-5.6
  at: 2026-08-26T19:44:29Z
---

# Domain-driven design

> **Authority:** The [Gen Stack vocabulary and relationship
> model](/glossary.md) is authoritative for canonical terms and relationships.
> This Explanation develops understanding without redefining them. When it
> discusses a profile-governed corpus representation, the [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) governs that representation.
> This document adds neither semantic authority nor profile-conformance rules.

Domain-driven design (DDD) is an approach to developing software for a complex
domain by building, applying, and continually refining a model of that domain.
The model supplies selected abstractions for solving domain problems; it is not
an inventory of everything that exists in the business.[^evans-ddd-reference]

DDD is not one pattern, a fixed architecture, or a catalog of class shapes. It
combines:

- **practices**, including collaborative modeling, use of a shared language,
  experimentation, and refactoring toward deeper insight;
- **principles**, such as concentrating modeling effort on the core domain,
  making model boundaries explicit, and keeping model and implementation in
  productive contact; and
- **patterns**, including bounded contexts, context-map relationships,
  entities, value objects, aggregates, repositories, factories, services, and
  domain events.

This document is an explanation of how those parts fit together. A team must
still develop the skill and judgment to model its own domain; adopting DDD
terminology or a framework does not create that practice.

## When DDD is useful

DDD earns its cost where behavior depends on specialized knowledge, important
terms are ambiguous, rules interact, or changing business understanding must
reshape the software. A simpler transaction script, data model, or integration
may be sufficient when the domain is straightforward and the software mainly
coordinates established operations.

The relevant question is not whether the system is large. It is whether a
better model of the domain would materially improve the decisions, language,
rules, and changeability of the software.

## The modeling loop

DDD treats a model as a working instrument rather than an analysis artifact
handed from one role to another:

1. Domain experts and software practitioners explore consequential scenarios,
   distinctions, rules, and exceptions.
2. They form a selective model and express it in a ubiquitous language.
3. The design, code, tests, and conversations put that model to work.
4. Friction, contradictions, and new domain insight expose weaknesses.
5. The team refines both model and implementation together.

Modeling therefore remains connected to implementation. A conceptual model
that cannot inform an effective design is incomplete, while code changes that
alter domain meaning are also changes to the model. Evans describes this
connection through model-driven design, hands-on modelers, and refactoring
toward deeper insight.[^evans-ddd-reference]

## Domain models and ubiquitous language

A **domain** is the field of activity or knowledge to which the software is
applied. A **domain model** is a system of abstractions that selects aspects of
that domain for understanding and solving relevant problems. Different
problems can justify different models of the same reality.

A **ubiquitous language** expresses one model consistently in conversation,
documentation, examples, tests, interfaces, and code. Domain experts and
software practitioners develop it together. Awkward expressions, conflicting
definitions, or concepts that cannot be stated precisely are modeling signals,
not merely vocabulary defects.[^evans-ddd-reference]

The language is ubiquitous within its bounded context, not necessarily across
the whole organization. The same word can carry different valid meanings in
different contexts; different words can identify related concepts that must be
translated at a boundary. Forcing one enterprise-wide canonical model can hide
those differences rather than resolve them.

## Strategic design

Strategic design decides where models apply, how they relate, and where scarce
modeling effort creates the most value. It keeps a detailed model from becoming
an undifferentiated model of the entire enterprise.

### Domains, subdomains, and investment

A **subdomain** is a cohesive part of the problem domain. Subdomains describe
the problem space; they do not by themselves prescribe packages, services, or
team boundaries.

Distinguish modeling investment by strategic role:[^ddd-crew-bounded-context-canvas]

| Role | Meaning | Typical implication |
| --- | --- | --- |
| **Core domain** | The specialized domain capability on which the strategy or distinctive value depends | Invest in deeper models and sustained collaboration |
| **Supporting subdomain** | Necessary domain-specific work that enables the core but does not itself differentiate the system | Model only to the depth justified by its consequences |
| **Generic subdomain** | A necessary problem already solved in broadly applicable ways | Prefer an established solution when differentiation is not valuable |

These classifications are contextual strategic judgments, not permanent
properties of a concept or technology. Evans's core-domain and
generic-subdomain patterns direct attention toward the most valuable
specialized model and away from treating every part of a system as equally
worthy of custom design.[^evans-ddd-reference]

Classification belongs primarily to the subdomain because it expresses the
strategic importance of problem-space knowledge. A bounded context can also be
assessed as core, supporting, or generic when it is the practical unit of
investment, but that assessment describes the context's strategic role; it
does not prove that the context and one subdomain are the same boundary. When a
context serves differently classified subdomains, retain the classifications
on the subdomains and state the context's investment priority separately.

### Bounded contexts

A **bounded context** defines where a particular model and its ubiquitous
language apply. Inside the boundary, terms, policies, valid-state definitions,
and sources of authority should be coherent. At the boundary, differences must
be translated, validated, or deliberately shared. Accepted invariant and
boundary obligations are Requirements of an eligible subject, normally the
Bounded Context or a structural element; the context explains the model and
authority that make those Requirements meaningful.

Describe a bounded context through durable meaning:

- the responsibility and authority it owns;
- its language and model;
- the policy and state for which it is authoritative;
- what it deliberately does not own;
- facts it accepts from upstream contexts and the relationships it maintains
  downstream; and
- linked Requirements for accepted translation, consistency, compatibility,
  failure, recovery, or coordination obligations at material boundaries.

A bounded context is not automatically a service, deployable, package, team,
repository, or database schema. Those boundaries can align when doing so
protects the model or authority, but treating them as synonyms confuses
semantic scope with current implementation structure.

Subdomains and bounded contexts are related views, not two names for one
hierarchy. A bounded context may model one subdomain, part of one, or parts of
several related subdomains. One subdomain may require several bounded contexts,
and a generic subdomain may be satisfied by an external product without a
custom context. State these relationships explicitly rather than inferring
them from folder or code ancestry.[^context-mapper-subdomains][^context-mapper-bounded-contexts]

Make a material bounded context visible in durable architecture documentation
and its context map. That documentation owns the context's purpose, model and
language scope, authority, exclusions, and consequential relationships. Code,
schemas, configuration, and tests own its exact current realization and should
be linked as evidence; structural checks can detect drift between the declared
boundary and implementation.[^context-mapper-architecture-validation]

### Context maps

A **context map** identifies the models in play and gives their points of
contact explicit direction and meaning. It is a relationship view, not simply
a diagram of boxes and untyped lines.[^evans-ddd-reference]

| Relationship | What it makes explicit |
| --- | --- |
| **Partnership** | Two contexts coordinate their evolution because each depends on the other's success |
| **Shared kernel** | Contexts deliberately share a small model or implementation surface and accept the coordination cost |
| **Customer–supplier** | An upstream context plans with the needs of a downstream customer in view |
| **Conformist** | A downstream context adopts an upstream model when influence or translation is not worthwhile |
| **Anti-corruption layer** | A downstream translation boundary protects its model from an unsuitable upstream model |
| **Open host service** | An upstream context offers a stable integration protocol for multiple consumers |
| **Published language** | Interchange uses a documented shared representation understood beyond one implementation |
| **Separate ways** | Contexts avoid integration because the value does not justify the coupling |
| **Big ball of mud** | A poorly bounded model is acknowledged and contained rather than allowed to blur other contexts |

These relationships are choices with consequences. For example, a shared
kernel reduces translation but increases coordinated change, while an
anti-corruption layer preserves downstream meaning at the cost of translation
and maintenance.

## Tactical modeling

Tactical patterns shape one model inside a bounded context. They are tools for
expressing domain meaning, not a checklist every context must implement.

| Concept | Modeling question | Essential distinction |
| --- | --- | --- |
| **Entity** | Must this thing remain identifiable through changes to its attributes? | Identity and continuity matter more than a snapshot of values |
| **Value object** | Is this concept defined entirely by its descriptive value? | Equality follows the modeled value; identity is irrelevant |
| **Domain event** | Which completed occurrence in the domain must the model represent? | It states domain meaning, not a transport, queue message, or event-sourcing requirement |
| **Domain service** | Does an important domain operation fit no entity or value object naturally? | It expresses domain behavior without becoming a generic application coordinator |
| **Module** | Which model elements form a cohesive conceptual group? | The boundary communicates domain structure rather than only filesystem organization |
| **Aggregate** | Which objects and rules require one consistency boundary? | One root controls changes within the boundary and protects aggregate invariants |
| **Repository** | How should a model retrieve and persist selected objects without exposing storage mechanics? | It presents collection-like domain access rather than a generic data-access API |
| **Factory** | How can a complex model object or aggregate be created validly without exposing assembly details? | Creation logic establishes a valid whole without displacing its later behavior |

### Entities and value objects

An entity's identity distinguishes it across time, even when its attributes
change or temporarily match another entity. A value object instead describes a
quantity, measurement, range, address, or other modeled value for which the
attributes and associated behavior are the whole meaning.[^evans-ddd-reference]

The distinction is contextual. An address might be a replaceable value inside
one model and an independently managed entity in another. Database keys,
mutability, and object-oriented class declarations do not determine the answer
by themselves.

### Aggregates and consistency

An **aggregate** clusters entities and value objects behind a boundary that
must preserve specified invariants. One entity is the aggregate root. External
objects refer to the aggregate through that root, and changes inside the
boundary are coordinated through the root or another explicitly designated
mechanism.[^evans-ddd-reference]

An aggregate invariant may be an implementation or model condition, or it may
realize an accepted Requirement. When the Gen Stack corpus admits the
preservation claim as desired state, the Requirement owns its normative
predicate and the domain model explains the aggregate response.

The aggregate is a consistency and authority boundary, not a convenient object
graph. Make it only large enough to preserve the rules that require one
synchronous decision. Rules spanning independently owned aggregates need an
honest coordination model, narrower observation boundary, or progress
guarantee; they should not be called immediately consistent by aspiration. See
[Invariants, preservation, and enforcement](/architecture/requirements/invariants-and-enforcement.md) for
the preservation semantics and [Expressing
invariants](/architecture/requirements/expressing-invariants.md) for routing accepted guarantees
to Requirements.

### Domain services, repositories, and factories

A **domain service** names a domain operation that is important but does not
belong naturally to an entity or value object. It remains stated in the
ubiquitous language. An application service may orchestrate a use case,
transactions, and external systems without owning the domain rule itself.

A **repository** gives the domain a deliberate way to obtain and store selected
model objects while keeping query and persistence mechanics outside the model.
It should reflect domain access needs rather than expose every storage
operation generically.

A **factory** encapsulates creation when assembling a valid entity, value
object, or aggregate is too complex for an ordinary constructor. It protects
creation invariants while leaving ongoing domain behavior with the created
model.

### Domain events

A **domain event** represents something that happened in the domain and matters
to domain experts. It is stated in past tense, carries the information needed
to understand the occurrence, and becomes part of the model when reactions,
history, notification, or coordination depend on it.[^evans-ddd-reference]

The domain event is not automatically an integration event. Crossing a bounded
context may require translation into a published contract with different
stability, privacy, delivery, and compatibility Requirements. Nor does using
domain events require storing state through event sourcing.

## Strategic and tactical design together

The concepts operate on related but distinct axes:

```text
problem space                         model and solution space

domain
└─ classified subdomains  ← models / is modeled by →  bounded contexts
                                                  ├─ ubiquitous language
                                                  ├─ tactical patterns
                                                  └─ context-map relationships
```

Do not infer containment or a strict one-to-one mapping from this relationship.
The useful test is whether each model remains coherent, each subdomain's
strategic importance remains visible, and every material model boundary and
translation obligation is explicit.

Tactical patterns take their meaning from the enclosing context. Entity
identity, aggregate boundaries, repository semantics, and domain-event names
should not silently cross into another model as though their meanings were
universal.

## Relationship to architecture views

DDD contributes semantic, policy, authority, and consistency boundaries. It
does not prescribe microservices, object orientation, layered architecture,
one database per context, or one team per context.

Keep related views distinct and connect them explicitly:

- a feature may be governed by one bounded context while appearing through
  several user-facing surfaces;
- a capability may draw on several contexts;
- a runtime container may host several contexts, while one context may span
  several containers; and
- trust, deployment, or availability concerns may justify a structural
  boundary even when the domain language remains shared.

Use [Capabilities in software
architecture](/architecture/capabilities/capabilities.md) for outcome and interaction
views, the [C4 model](/architecture/structure/c4-model.md) for runtime and code structure, and
[Reviewing responsibilities with
scenarios](/architecture/reviewing-responsibilities-with-scenarios.md) to test
ownership and authority boundaries against behavior and likely change.
Preserve model meaning in durable documentation; leave exact schemas,
endpoints, tables, and current module placement with their executable owners.

When representing maintained subdomains, bounded contexts, and context maps in
an OKF bundle, apply the [Gen Stack application
profile](/profile/gen-stack-application-profile.md)
for their type usage, metadata, paths, classification, and validation rules.
The [Gen Stack vocabulary and relationship model](/glossary.md) owns the
author-facing cross-view relationship meanings. The profile's `relationships`
map records controlled model mappings and map participation while prose keeps
directional dependency and translation meaning explicit.

Use the focused guides for [subdomains](/intent/documenting-subdomains.md),
[bounded contexts](/architecture/domains/documenting-bounded-contexts.md), and [context
maps](/architecture/domains/documenting-context-maps.md) when authoring one artifact.

## Common reductions

- **Pattern checklist** — adding entities, repositories, and services without
  doing collaborative domain modeling.
- **Noun extraction** — turning every business noun into a class while missing
  decisions, rules, transitions, and language.
- **Database-first model** — allowing tables and persistence mechanics to
  define domain meaning and transaction boundaries by default.
- **Global canonical model** — forcing one definition across contexts that
  legitimately use different models.
- **Bounded context as deployment** — declaring each service, repository, or
  team a context without identifying a coherent model and language.
- **Subdomain as context folder** — treating directory containment or a shared
  name as proof that one bounded context implements exactly one subdomain.
- **Context inferred only from code** — leaving purpose, model scope,
  authority, and cross-context relationships implicit in current packages or
  services.
- **Aggregate as object graph** — making aggregates large navigation or loading
  units instead of small invariant and authority boundaries.
- **Event as transport** — naming technical messages as domain events without a
  meaningful domain occurrence.
- **Universal rich model** — applying costly tactical modeling to generic or
  straightforward work where it provides little advantage.
- **Static model** — treating the first model as a specification to preserve
  rather than a hypothesis refined through implementation and domain learning.

[^evans-ddd-reference]: Evans defines the core DDD concepts and presents them
    as a connected pattern language spanning model use, tactical building
    blocks, context mapping, and strategic distillation.
[^ddd-crew-bounded-context-canvas]: The DDD Crew's Bounded Context Canvas uses
    core, supporting, and generic classifications to discuss the strategic role
    of a context and the investment its model warrants.
[^context-mapper-subdomains]: Context Mapper models domains and subdomains in
    the problem space and relates them to bounded contexts with an explicit
    implementation relationship.
[^context-mapper-bounded-contexts]: Context Mapper models bounded contexts as
    separate roots that can implement one or more subdomains rather than as
    children whose directory position establishes identity.
[^context-mapper-architecture-validation]: Context Mapper demonstrates
    validating a declared bounded-context model against code structure with
    architecture tests, keeping the model explicit without making prose the
    authority for exact implementation mechanics.
