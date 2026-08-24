---
type: Standard
title: Software architecture docs application profile for OKF v0.2
description: The application profile for representing demand and value, goal-oriented behavior, product quality requirements, capabilities, interactions, domain architecture, and C4 structure in a set of OKF v0.2 software architecture docs.
tags:
  [
    architecture,
    okf,
    application-profile,
    offerings,
    audiences,
    jobs-to-be-done,
    value-propositions,
    use-cases,
    product-quality,
    quality-requirements,
    capabilities,
    features,
    surfaces,
    domain-driven-design,
    c4-model,
  ]
status: draft
sources:
  - id: okf-v0.2
    resource: https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md
    title: Open Knowledge Format v0.2
  - id: okf-profile-proposal
    resource: https://github.com/GoogleCloudPlatform/knowledge-catalog/issues/212
    title: Proposal for an opt-in OKF profile declaration
  - id: dcmi-application-profile
    resource: https://www.dublincore.org/resources/glossary/application_profile/
    title: DCMI definition of an application profile
  - id: just-enough-architecture-docs
    resource: just-enough-architecture-docs.md
    title: Just Enough Architecture Docs
  - id: architecture-docs-organization
    resource: ../guides/organizing-an-architecture-docs-corpus.md
    title: Organizing an architecture docs corpus
  - id: capabilities
    resource: ../foundations/capabilities.md
    title: Capabilities in software architecture
  - id: offerings-and-value
    resource: ../foundations/offerings-and-value.md
    title: Offerings and value in software architecture
  - id: jobs-to-be-done
    resource: ../foundations/jobs-to-be-done.md
    title: Jobs to Be Done
  - id: goal-oriented-behavior
    resource: ../foundations/goal-oriented-behavior.md
    title: Goal-oriented behavior and use cases
  - id: product-quality
    resource: ../foundations/product-quality.md
    title: Product quality in software architecture
  - id: iso-25010
    resource: https://www.iso.org/standard/78176.html
    title: ISO/IEC 25010:2023 — Product quality model
  - id: iso-25030
    resource: https://www.iso.org/standard/72116.html
    title: ISO/IEC 25030:2019 — Quality requirements framework
  - id: domain-driven-design
    resource: ../foundations/domain-driven-design.md
    title: Domain-driven design
  - id: c4-model
    resource: ../foundations/c4-model.md
    title: C4 model
generated:
  by: codex/gpt-5.6
  at: 2026-08-22T00:17:07Z
---

# Software architecture docs application profile for OKF v0.2

## Profile identity

| Property           | Value                                                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Profile identity   | `software-architecture-docs`                                                                                                       |
| Profile version    | `0.7.0`                                                                                                                            |
| Base specification | OKF v0.2                                                                                                                           |
| Status             | Draft                                                                                                                              |
| Applies to         | Primary concepts under `value/`, `use-cases/`, `quality/`, `capabilities/`, `features/`, `surfaces/`, `domains/`, and `structure/` |
| Audience           | Architecture authors, maintainers, reviewers, and profile validators                                                               |

## Purpose and scope

Using the DCMI sense of an application profile,[^dcmi-application-profile] this
document defines how one set of software architecture docs represents accepted,
durable demand, value, behavior, product quality, capability, interaction,
domain, and structural knowledge using Open Knowledge Format (OKF) v0.2. OKF defines the
document envelope, path-based concept identity, provenance, trust, and
lifecycle fields.[^okf-v0.2] This profile adds one coherent vocabulary of concept types,
frontmatter, paths, containment rules, and validation checks for the
architecture views that currently need repeatable authoring rules.

The profile applies the [Just Enough Architecture
Docs](just-enough-architecture-docs.md) pattern[^just-enough-architecture-docs]
and [corpus-organization
guide](../guides/organizing-an-architecture-docs-corpus.md) alongside the
bundle's foundations for [offerings and value](../foundations/offerings-and-value.md),
[Jobs to Be Done](../foundations/jobs-to-be-done.md),
[goal-oriented behavior](../foundations/goal-oriented-behavior.md), [product
quality](../foundations/product-quality.md),
[capabilities](../foundations/capabilities.md), [domain-driven
design](../foundations/domain-driven-design.md), and the [C4
model](../foundations/c4-model.md). Those views remain distinct and
complementary; this profile gives them one metadata and documentation contract
rather than treating them as one hierarchy.[^architecture-docs-organization]

The upstream OKF profile proposal remains open. This document therefore does
not claim a standardized OKF declaration field, registry, or executable
descriptor.[^okf-profile-proposal] An architecture documentation set adopts
this profile only when its root `index.md` contains an explicit sentence such
as: “This documentation set adopts the `software-architecture-docs` profile at
the linked profile location, version 0.7.0.” The sentence MUST link the profile
location. A link without explicit adoption language is informative and MUST
NOT establish adoption.

This version covers:

- offerings, audiences, needs, jobs to be done, and value propositions;
- goal-oriented use cases;
- architecture-significant product quality requirements classified by
  ISO/IEC 25010:2023;
- capabilities, features, and actor-facing surfaces;
- subdomains, bounded contexts, and context maps; and
- C4 software systems, containers, components, and selected views.

It is an open-world profile. Strategy, invariants, stakeholder concerns not
represented as Product Quality Requirements, shared modules, and other useful
architecture concepts MAY coexist in the same OKF bundle
under base OKF rules until a present authoring or consumer need justifies
additional profile requirements. The profile does not require a document for
every possible element or prescribe source-code structure.

Actor, Goal, Scenario, Extension, Responsibility, Collaborator, User Story,
Epic, Story Map, CRC Card, Walking Skeleton, Spike, Port, and Adapter are not
primary concept types in this profile. They are contextual roles, use-case
substructure, element properties, relationships, delivery or learning
artifacts, review techniques, or pattern-specific constructs. A documentation
set MAY represent one under open-world OKF rules when a concrete local
authority or consumer needs it, but MUST NOT present that local type as part of
this profile.

Product Quality View and Quality Concern are also not primary concept types.
System-level product-quality priorities and tradeoffs belong in the existing
architecture overview or canonical C4 Software System concept. A stakeholder
quality need, risk, or concern remains with its owning discovery, requirement,
risk, or proposal authority until accepted meaning independently qualifies as
a Product Quality Requirement.

## Conformance

Assess and report two independent results:

1. **OKF conformance** states whether the bundle satisfies OKF v0.2.
2. **Profile conformance** states whether the applicable concepts satisfy this
   profile's additional software-architecture requirements.

A bundle may conform to OKF while failing this profile. A profile-only failure
MUST NOT be reported as an OKF specification violation.

For profile conformance, the documentation set MUST:

1. use the defined concept types and paths for applicable primary concepts;
2. satisfy the common and type-specific requirements;
3. preserve DDD distinctions and C4 containment where those models define
   them;
4. keep every maintained concept reachable from the root `index.md`;
5. expose the system-level lifecycle and stewardship context defined below;
   and
6. pass the profile validation rules.

The keywords MUST, MUST NOT, SHOULD, SHOULD NOT, and MAY state normative
requirements in this profile.

## Common frontmatter

Every concept governed by this profile MUST include:

| Field         | Requirement | Meaning                                                               |
| ------------- | ----------- | --------------------------------------------------------------------- |
| `type`        | Required    | Exact concept type defined by this profile                            |
| `title`       | Required    | Stable canonical display name                                         |
| `description` | Required    | One sentence distinguishing the concept from its neighbors            |
| `status`      | Required    | `draft`, `stable`, or `deprecated`                                    |
| `tags`        | Recommended | Search terms, aliases, and relevant domain or architecture vocabulary |

The standard OKF fields `sources`, `generated`, `verified`, `stale_after`, and
`resource` MAY be used when truthful and applicable. A concept MUST NOT repeat
its path-based concept ID in frontmatter. Provenance and verification MUST
describe events that actually occurred; generated content MUST NOT be marked
as human-verified without a separate human verification event.

`status` describes the knowledge document's lifecycle, not whether an offering
is commercially available, a capability is currently mature, or a system is
operational. These profile concepts are normally abstract, so `resource`
SHOULD be omitted unless the concept describes a distinct underlying asset with
a canonical resource.

## Corpus-wide documentation requirements

The documentation set is a human-facing semantic delta over its repository and
operational authorities. Each concept SHOULD be concise, easy to scan, and
organized around one cohesive subject. It MUST NOT copy an inventory of current
code, repository structure, interfaces, configuration, deployments, or runtime
state when an authoritative source, stable query, or generated view can reveal
the same facts reliably enough. The concept SHOULD link that evidence and own
only the durable interpretation, boundary, rationale, or consequence that the
evidence does not explain.

The architecture overview or canonical system-of-interest `C4 Software System`
concept MUST make these discoverable, directly or by links to their stable
authorities:

- the system lifecycle or support state using locally accepted terminology;
- the person, role, team, or mechanism responsible for maintenance and
  architecture decisions; and
- the events or changes that trigger architecture-documentation review.

The documentation set MUST NOT overload OKF `status` with system lifecycle or
copy volatile team rosters, on-call schedules, or service-catalog records.
Containers and components inherit system-level lifecycle and stewardship
context. Their concepts SHOULD state only a consequential exception, such as a
distinct owner, lifecycle, support policy, criticality, or retirement path.

A diagram or table SHOULD be used when it materially improves comprehension of
several relationships, mappings, containment levels, or an interaction
sequence. A maintained visual MUST state its scope or question and MUST NOT
become a manually duplicated realization inventory when generation is
practical.

## Demand and value types

These types keep demand and offered value independently addressable without
assuming a commercial product root or nesting every architecture view beneath
an offering.[^offerings-and-value]

No type in this section requires custom frontmatter beyond the common fields.
Contextual roles, circumstances, scope, claims, and cross-concept relationships
belong in the document body and explicit Markdown links using the
author-facing meanings in [Relationship semantics](#relationship-semantics).

### Offering

```yaml
---
type: Offering
title: Reservation platform
description: A service that lets travelers secure scarce capacity and lets operators manage those commitments.
tags: [reservations, travelers, capacity]
status: stable
---
```

An Offering SHOULD explain:

- the coherent value intentionally made available;
- the audiences and circumstances in scope;
- its boundary and material exclusions; and
- relevant evidence or authority for its accepted definition.

An offering may be a product, service, platform, program, shared facility, or
combination of people, process, and software. It is not necessarily a
commercial product, deployable application, C4 Software System, capability, or
feature collection.

For a focused procedure, see [Documenting
offerings](../guides/documenting-offerings.md).

### Audience

```yaml
---
type: Audience
title: Travelers
description: People seeking dependable capacity commitments while planning or completing a journey.
tags: [travelers, requesters, reservations]
status: stable
---
```

An Audience SHOULD explain:

- the durable group and circumstances that distinguish it;
- the contextual roles it plays for relevant offerings or interactions;
- material exclusions; and
- evidence for consequential segmentation or need claims.

An Audience MUST NOT identify a private individual or customer in a public
architecture corpus. A user, operator, purchaser, sponsor, partner, maintainer,
or beneficiary is a contextual role rather than a required global
classification. Personas, interview records, and customer accounts remain in
their appropriate research or operational authorities.

For a focused procedure, see [Documenting
audiences](../guides/documenting-audiences.md).

### Need

```yaml
---
type: Need
title: Dependable capacity commitments
description: The need to rely on scarce capacity remaining available while an eligible decision is completed.
tags: [capacity, commitments, reservations]
status: stable
---
```

A Need SHOULD explain:

- the problem, constraint, opportunity, or desired outcome independently of a
  solution;
- the audiences and circumstances for which it matters;
- material distinctions and exclusions; and
- the accepted evidence or authority supporting consequential claims.

A need is not a proposed feature, implementation, objective, or delivery work
item.

For a focused procedure, see [Documenting
needs](../guides/documenting-needs.md).

### Job to Be Done

```yaml
---
type: Job to Be Done
title: Secure capacity for a journey
description: The progress a traveler seeks when scarce capacity may disappear before plans can be confirmed.
tags: [travelers, capacity, planning, jobs-to-be-done]
status: stable
---
```

A Job to Be Done SHOULD explain:

- the audience seeking progress;
- the progress and circumstances that create demand;
- relevant functional, social, or emotional forces without requiring all three
  as separate classifications;
- material exclusions; and
- the accepted evidence or authority supporting the job.

A Job to Be Done is a demand-side model. It is not a system capability, use-case
flow, feature, or universal replacement for every kind of need.[^jobs-to-be-done]

For a focused procedure, see [Documenting Jobs to Be
Done](../guides/documenting-jobs-to-be-done.md).

### Value Proposition

```yaml
---
type: Value Proposition
title: Confident reservations for travelers
description: Why travelers can rely on an accepted capacity hold remaining available until confirmation, expiration, or release.
tags: [travelers, reservations, confidence, capacity]
status: stable
sources:
  - id: accepted-reservation-policy
    resource: /strategy/accepted-reservation-policy.md
    title: Accepted reservation policy
---
```

A Value Proposition SHOULD explain:

- the offering and audience to which the promise applies;
- the needs or jobs it addresses;
- the promised benefit and how the audience recognizes value;
- material scope, exclusions, and limitations; and
- evidence or authority for material claims.

A value proposition is not evidence that an outcome occurred, current
marketing copy, pricing, availability, or a roadmap commitment. Time-sensitive
claims SHOULD use `stale_after` when an absolute review boundary is known.

For a focused procedure, see [Documenting value
propositions](../guides/documenting-value-propositions.md).

Audience, Need, Job to Be Done, and Value Proposition concepts making material
claims about people or organizations SHOULD include truthful `sources` or link
to accepted evidence in their bodies. Absence of evidence MUST NOT be disguised
with fabricated provenance or verification metadata.

## Goal-oriented behavior type

Use Case is the behavioral bridge from actor goals and a subject boundary to
the capabilities, interaction surfaces, domain authority, software
responsibilities, dynamic views, and evidence that make the behavior possible.
Actor, goal, scenario, and extension are contextual parts of a use case rather
than additional profile concept types.[^goal-oriented-behavior]

### Use Case

```yaml
---
type: Use Case
title: Confirm a reservation
description: How a traveler turns an eligible capacity hold into a confirmed reservation.
tags: [traveler, reservation, confirmation, actor-goal]
status: stable
---
```

A Use Case MUST identify:

- the subject boundary;
- the primary actor role;
- the actor's goal; and
- the successful outcome.

A Use Case SHOULD explain:

- the goal scope as `summary`, `user-goal`, or `subfunction`, normally
  `user-goal`;
- supporting actors or external services;
- a concise, technology-neutral main success scenario;
- extension conditions and handling that change durable architectural
  meaning;
- material exclusions and relationships to other architecture views; and
- the tests, requirements, or executable examples that own precise scenarios.

A use case SHOULD normally name an Offering or C4 Software System as its
subject. An Audience or C4 Software System may play an actor role, but Actor is
contextual and MUST NOT be inferred as a permanent classification. Capability
describes an ability exercised by the use case, and Surface describes an
encounter point; neither replaces the subject.

A use case is not a Job to Be Done, user-interface flow, user story, delivery
epic, or exhaustive test-case inventory. An individual action or delivery-sized
fragment MUST NOT be maintained as a Use Case. UML notation MAY be used but is
not required.

For a focused procedure, see [Documenting use
cases](../guides/documenting-use-cases.md).

## Product quality type

The product quality type preserves only accepted, architecture-significant
requirements. ISO/IEC 25010:2023 supplies the classification vocabulary;
ISO/IEC 25030:2019 supplies the broader quality-requirements context. The
architecture corpus does not attempt to replace a complete requirements or
quality-management system.[^product-quality][^iso-25010][^iso-25030]

Authors and validators applying this profile's Product Quality Requirement
classification rules MUST have lawful access to the exact ISO/IEC 25010:2023
product-quality subcharacteristic names. This bundle names the top-level
characteristics for orientation but does not reproduce the standard's complete
copyrighted taxonomy. The profile alone is therefore insufficient to select
or validate an exact subcharacteristic slug.

### Product Quality Requirement

```yaml
---
type: Product Quality Requirement
title: Resume interrupted imports
description: Accepted imports survive worker loss without accepting a record twice.
tags: [product-quality, reliability, recoverability, imports]
status: stable
---
```

A Product Quality Requirement MUST represent one named, accepted, assessable
quality outcome for a stated target system or constituent. It MUST identify:

- the target whose quality is constrained;
- the relevant conditions, event, or operating environment;
- the required outcome or response;
- its primary ISO/IEC 25010:2023 characteristic and subcharacteristic;
- why it is architecture-significant and the durable architectural
  consequences it creates; and
- an assessment criterion or a meaningful link to the authority that owns the
  applicable measure, target, test, evaluation, or operational evidence.

The title MUST name the required outcome rather than repeat a characteristic,
subcharacteristic, implementation, or current numerical target. The body
SHOULD link the accepted need, use case, risk, policy, or obligation that
justifies the requirement and SHOULD state material tradeoffs. A requirement
MAY identify consequential secondary ISO/IEC 25010 classifications, but it
MUST have one canonical document under its primary classification.

The requirement MUST pass the Just Enough Architecture Docs admission test.
It is architecture-significant when satisfying it materially constrains a
responsibility, boundary, state or recovery model, dependency, invariant,
technology or deployment choice, ability to change, or consequential
tradeoff. A local target, validation rule, or observed product property MUST
NOT be represented as a Product Quality Requirement merely because it can be
classified by ISO/IEC 25010.

An accepted qualitative requirement MAY be maintained before it has a
numerical target when its conditions, required response, assessment criterion,
and architectural consequences are unambiguous. Authors MUST NOT invent a
number, infer accepted desired state from implementation or telemetry, or turn
an unresolved need, risk, target, or design option into a stable requirement.

When an external requirement, policy, service-objective, or compliance system
already owns the requirement, architecture documentation MUST link that
authority from the affected architecture concept rather than maintain a shadow
Product Quality Requirement. Current measures, observations, implementation,
and test details SHOULD remain with their executable or live authorities.

This profile governs only product quality requirements classified by
ISO/IEC 25010:2023. It does not profile quality-in-use, data-quality, process,
service-management, or organizational-quality requirements. Those authorities
MAY be linked when they motivate or assess a Product Quality Requirement.

For a focused procedure, see [Documenting product quality
requirements](../guides/documenting-product-quality-requirements.md).

## Capability, feature, and surface types

These types keep stable abilities, recognizable behavior, and actor-facing
encounter points independently addressable.[^capabilities]

### Capability

```yaml
---
type: Capability
title: Reservation management
description: The platform's ability to make and preserve capacity promises for eligible requesters.
tags: [reservations, capacity, allocation]
status: stable
---
```

A Capability SHOULD explain:

- its bearer and level, such as organization, system, or subsystem;
- the outcome-oriented ability and why it matters;
- exclusions that distinguish it from neighboring capabilities; and
- consequential decomposition, constraints, or evidence when maintained.

When related use cases are maintained, the Capability SHOULD state which use
cases exercise or require the ability without restating their actor goals or
scenarios.

A capability is not a goal, feature, process, organizational unit, application,
or delivery work item. Capability decomposition MAY use an adjacent
same-named directory when every child remains an ability at a declared level.

For a focused procedure, see [Documenting
capabilities](../guides/documenting-capabilities.md).

### Feature

```yaml
---
type: Feature
title: Saved traveler details
description: Reusable behavior that lets travelers retain verified details across reservation and modification use cases.
tags: [traveler, profiles, reservations]
status: stable
---
```

A Feature SHOULD explain:

- the independently recognizable behavior and intended outcome;
- the actors and conditions in scope;
- the use cases or surfaces across which the behavior has durable identity;
- material exclusions and failure semantics; and
- the evidence that owns precise supported behavior when maintained.

A Feature is optional and SHOULD NOT be created when it merely paraphrases one
Use Case. It remains distinct from the broader ability it helps provide and is
not a delivery work item merely because work is required to provide it.

For a focused procedure, see [Documenting
features](../guides/documenting-features.md).

### Surface

```yaml
---
type: Surface
title: Traveler checkout
description: The traveler-facing interaction point for reviewing and confirming a reservation.
tags: [traveler, checkout, interaction]
status: stable
---
```

A Surface SHOULD explain:

- the actor-facing encounter point and actors in scope;
- the interaction boundary and recognizable behavior available there;
- material exclusions; and
- relevant accessibility, trust, or operational constraints when maintained.

A surface may be an application, API, command line, protocol, device, or
console in an interaction view. That does not by itself determine its C4 type.
A use case may be enacted through several surfaces; the Surface exposes
behavior but does not own the actor's goal or scenario.

For a focused procedure, see [Documenting
surfaces](../guides/documenting-surfaces.md).

## Domain-driven design types

These types keep problem-space classification separate from model and language
boundaries.[^domain-driven-design]

### Subdomain

```yaml
---
type: Subdomain
title: Reservation management
description: The problem of making and preserving capacity promises for eligible requesters.
classification: core
tags: [reservations, capacity, allocation]
status: stable
---
```

`classification` is required and MUST be exactly one of:

- `core`;
- `supporting`; or
- `generic`.

Classification belongs to the Subdomain and expresses the strategic
importance of problem-space knowledge in the documented system and strategic
context. A Subdomain SHOULD explain its problem-space responsibility,
important distinctions, classification rationale, and exclusions.

For a focused procedure, see [Documenting
subdomains](../guides/documenting-subdomains.md).

### Bounded Context

```yaml
---
type: Bounded Context
title: Reservations
description: The model governing reservation state, capacity promises, confirmation, expiration, and release.
tags: [reservations, capacity, lifecycle]
status: stable
---
```

A Bounded Context MUST NOT carry `classification`. It SHOULD explain its
purpose, model and language scope, authority, exclusions, and the evidence that
establishes its current realization or conformance. A bounded context is not a
subdomain or a code folder, although those concepts may align in a particular
architecture.

For a focused procedure, see [Documenting bounded
contexts](../guides/documenting-bounded-contexts.md).

### Context Map

```yaml
---
type: Context Map
title: Reservation platform context map
description: The directional integration view among reservation-platform bounded contexts.
tags: [context-map, integration, boundaries]
status: stable
---
```

A Context Map SHOULD identify the bounded contexts in scope, dependency
direction, translation boundaries, consistency and failure obligations, and
accepted architectural consequences. It owns the maintained inter-context
view; individual context documents SHOULD avoid copying the complete map.

For a focused procedure, see [Documenting context
maps](../guides/documenting-context-maps.md).

## C4 types

These types preserve the distinction between canonical model elements and
selected views of those elements.[^c4-model]

### C4 Software System

```yaml
---
type: C4 Software System
title: Reservation platform
description: The software system that accepts reservation requests and preserves capacity promises.
tags: [reservation-platform, system-of-interest]
status: stable
---
```

A C4 Software System SHOULD explain the value it delivers, its responsibility,
boundary, material exclusions, whether it is the system of interest or an
external system, its interactors, lifecycle or support state, stewardship and
decision-authority route, review triggers, and relevant evidence. State
responsibility as a concise active outcome, policy, state, or invariant the
system owns rather than a list of functions. The architecture overview MAY own
this system-of-interest meaning when a separate concept would duplicate it;
the software-system concept then SHOULD link to that authority instead of
repeating it.

For a focused procedure, see [Documenting C4 software
systems](../guides/documenting-c4-software-systems.md).

### C4 Container

```yaml
---
type: C4 Container
title: Reservation service
description: The server application that owns reservation state and coordinates capacity promises.
tags: [reservation-service, server-application]
status: stable
---
```

A C4 Container MUST identify exactly one containing C4 Software System. It
SHOULD explain its application or data-store responsibility, runtime boundary,
consequential technology choices, boundary-crossing interactions, exclusions,
and relevant evidence. Its
responsibility SHOULD identify the outcome, policy, state, or invariant it owns
rather than inventorying current functions. A container MUST NOT contain
another container. Deployment-node or infrastructure nesting MUST NOT be
represented as C4 container containment. Lifecycle and stewardship inherit
from the containing system; a Container SHOULD document only a consequential
exception.

For a focused procedure, see [Documenting C4
containers](../guides/documenting-c4-containers.md).

### C4 Component

```yaml
---
type: C4 Component
title: Reservation application component
description: The cohesive application component that coordinates reservation commands and state transitions.
tags: [reservations, application-component]
status: stable
---
```

A C4 Component SHOULD explain its cohesive responsibility, defined interface,
one owning container, material dependencies, exclusions, and relevant
evidence. Its name, interface, state, and dependencies SHOULD align with the
outcome, policy, state, or invariant named by its responsibility. It MUST
belong to exactly one container and MUST NOT recursively contain components. A
package, source folder, service, bounded context, or shared library is not a C4
Component merely because it contains code. Lifecycle and stewardship inherit
through the owning container; a Component SHOULD document only a consequential
exception.

For a focused procedure, see [Documenting C4
components](../guides/documenting-c4-components.md).

### C4 View

```yaml
---
type: C4 View
title: Reservation platform system context
description: The people and external software systems that interact directly with the reservation platform.
view_type: system-context
tags: [c4, system-context, reservation-platform]
status: stable
---
```

`view_type` is required and MUST be exactly one of:

- `system-landscape`;
- `system-context`;
- `container`;
- `component`;
- `code`;
- `dynamic`; or
- `deployment`.

A C4 View MUST state its scope and primary question. It SHOULD identify shown
elements by C4 type, name, and responsibility; make interactions directional
and meaningfully labeled; state consequential technology; explain unfamiliar
notation; and include a legend when needed. A deployment view MUST name its
environment. A dynamic view MUST identify one feature, use case, or behavior
and the one scenario it illustrates; name the initiator and intended or
terminal outcome; and make ordering or coordination explicit. When an
originating Use Case concept exists, the view SHOULD link it and identify
whether the scenario is the main success scenario or a named extension. Code
views SHOULD normally be generated from executable sources.
Container, component, code, and deployment views that primarily show current
realization SHOULD also be generated when practical. A manually maintained view
SHOULD emphasize durable boundaries, responsibilities, relationships, and
consequences rather than reproduce a discoverable inventory.

For a focused procedure, see [Documenting C4
views](../guides/documenting-c4-views.md).

## Paths and concept identity

Applicable concepts MUST use these bundle-relative paths:

```text
value/
├── index.md
├── offerings/
│   ├── index.md
│   └── <offering>.md
├── audiences/
│   ├── index.md
│   └── <audience>.md
├── needs/
│   ├── index.md
│   └── <need>.md
├── jobs/
│   ├── index.md
│   └── <job-to-be-done>.md
└── value-propositions/
    ├── index.md
    └── <value-proposition>.md
use-cases/
├── index.md
└── <use-case>.md
quality/
├── index.md
└── <iso-25010-characteristic>/
    ├── index.md
    └── <iso-25010-subcharacteristic>/
        ├── index.md
        └── <product-quality-requirement>.md
capabilities/
├── index.md
└── <capability>.md
features/
├── index.md
└── <feature>.md
surfaces/
├── index.md
└── <surface>.md
domains/
├── index.md
├── core/
│   ├── index.md
│   └── <subdomain>.md
├── supporting/
│   ├── index.md
│   └── <subdomain>.md
├── generic/
│   ├── index.md
│   └── <subdomain>.md
├── contexts/
│   ├── index.md
│   └── <bounded-context>.md
└── context-maps/
    ├── index.md
    └── <context-map>.md
structure/
├── index.md
├── systems/
│   ├── index.md
│   └── <software-system>.md
├── containers/
│   ├── index.md
│   ├── <container>.md
│   └── <container>/
│       ├── index.md
│       └── components/
│           ├── index.md
│           └── <component>.md
└── views/
    ├── index.md
    ├── system-landscape.md
    ├── system-context.md
    ├── containers.md
    ├── components/
    │   ├── index.md
    │   └── <container>.md
    ├── dynamics/
    │   ├── index.md
    │   └── <interaction>.md
    ├── deployments/
    │   ├── index.md
    │   └── <environment>.md
    └── code/
        ├── index.md
        └── <component>.md
```

Omit collections and views that have no admitted content. The tree defines
placement when a concept exists; it does not require empty directories,
complete catalogs, or all C4 view types.

When the first concept of a type is admitted, create its canonical collection,
navigational `index.md`, and named `<concept>.md` file immediately. A
documentation set MUST NOT place several independently addressable peer
concepts in a plural catch-all file such as `use-cases.md`, `capabilities.md`,
or `features.md` for later splitting. Collection existence is conditional;
concept identity is stable from first admission.

Offerings, audiences, needs, jobs to be done, and value propositions MUST use
their sibling collections under `value/`. Use Cases MUST use the top-level
`use-cases/` collection. These paths do not imply containment or a one-to-one
mapping. An offering MUST NOT physically contain the audience, need, job,
proposition, use case, capability, feature, surface, domain, or structural
concepts associated with it.

Product Quality Requirements MUST use the top-level `quality/` collection and
the kebab-case English names of their primary ISO/IEC 25010:2023 characteristic
and subcharacteristic. The characteristic and subcharacteristic directories
classify requirements; their `index.md` files remain navigational and MUST NOT
serve as characteristic definitions, quality summaries, or plural requirement
documents. `quality/index.md` MUST NOT be presented as a mandatory Product
Quality View. System-level prioritization and cross-requirement tradeoffs
belong in the architecture overview or canonical C4 Software System concept.

The characteristic path segment MUST be exactly one of:

- `functional-suitability`;
- `performance-efficiency`;
- `compatibility`;
- `interaction-capability`;
- `reliability`;
- `security`;
- `maintainability`;
- `flexibility`; or
- `safety`.

The subcharacteristic segment MUST use the corresponding kebab-case English
subcharacteristic name from ISO/IEC 25010:2023. A repository MAY project
localized display text in its indexes, but the canonical concept path remains
stable and version-pinned.

Create a characteristic and subcharacteristic route only with its first
admitted named requirement. When one requirement maps to several
subcharacteristics, its canonical path MUST use one primary classification and
the body SHOULD state meaningful links to additional classifications. Authors
MUST NOT duplicate the requirement beneath several taxonomy paths.

A concept requiring cohesive subordinate documents MAY keep its canonical
`<concept>.md` and add a same-named adjacent directory. Its concept ID remains
the path of the canonical file. A concept MUST NOT be represented by
`index.md`, which OKF reserves for navigation.[^okf-v0.2]

Subdomains belong under the directory matching their `classification`.
Bounded contexts and context maps are sibling collections, not children of a
classified subdomain. Their paths do not imply a one-to-one mapping.

A C4 Component's path beneath `structure/containers/<container>/components/`
expresses its one true owning-container relationship. Views remain separate
from the canonical elements they show and MUST NOT replace those elements.

## Relationship semantics

Architecture views remain coherent through explicit, meaningful
relationships rather than a universal hierarchy. When a relationship below is
consequential and both concepts are maintained, authors SHOULD state its
meaning in prose around an ordinary Markdown link:

| Relationship                                                                                                       | Meaning                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| audience or external participant **plays actor role in** use case                                                  | The participant acts from outside the subject boundary in this behavioral context. Primary or supporting role is contextual to the use case.  |
| use case **has subject** offering or C4 software system                                                            | The named subject owns the behavior offered to its actors.                                                                                    |
| use case **refines** or **uses subgoal** use case                                                                  | A summary or user goal depends on a narrower goal. This relationship forms a graph, not physical containment.                                 |
| feature **enables** use case                                                                                       | Independently recognizable behavior contributes to achieving the actor goal.                                                                  |
| use case **exercises** capability                                                                                  | The subject requires or invokes the bearer's ability while pursuing the goal.                                                                 |
| use case **is enacted through** surface                                                                            | Actors encounter the behavior at the named interaction point.                                                                                 |
| use case **uses authority from** bounded context                                                                   | The context owns relevant language, rules, policy, or state.                                                                                  |
| need, use case, risk, policy, or obligation **justifies** Product Quality Requirement                              | The originating authority explains why the accepted quality outcome matters. A risk, policy, or obligation need not be a profiled concept.    |
| Product Quality Requirement **qualifies** target concept                                                           | The requirement constrains the stated system, constituent, capability, feature, use case, or other maintained subject under named conditions. |
| architecture concept **responds to** Product Quality Requirement                                                   | The concept owns a responsibility, boundary, state model, invariant, dependency, deployment choice, or tradeoff shaped by the requirement.    |
| C4 element **realizes** use case, feature, capability, or surface                                                  | The structural element implements or operates part of the related view.                                                                       |
| C4 Dynamic View **illustrates scenario of** use case                                                               | The view selects one main or extension scenario and shows ordered collaboration among canonical elements.                                     |
| test, measure, objective, evaluation, telemetry, contract, or executable example **provides evidence for** concept | The linked authority owns exact criteria, cases, observations, or current facts that the architecture concept should not copy.                |

The phrases above define author-facing meaning, not relationship identifiers.
Profile version 0.7.0 does not define relationship frontmatter, permitted
source and target fields, reciprocity rules, or canonical machine-readable
direction. No custom relationship field is required for conformance, and a
producer-defined field MUST NOT be presented as standardized by OKF or by this
profile.

Fields such as `actors`, `audiences`, `jobs`, `capabilities`, `features`, or
`use_cases` MUST NOT be treated as profile-defined relationships. A future
profile version MAY add structured relationships only for a demonstrated
consumer need and as an explicit normative change with migration guidance. C4
component placement and the model-defined containment rules above remain
structural constraints; they are not a general semantic relationship
vocabulary.

## Authority, indexes, and change

Architecture concepts own accepted, durable meaning. Code, tests, schemas,
configuration, diagrams, and runtime systems own exact or current facts when
they express those facts better. Concepts SHOULD identify relevant evidence
without copying it. Current realization views SHOULD be generated from their
authoritative sources when practical. A generated or linked inventory does not
remove the need to explain any consequential boundary, responsibility,
rationale, or invariant that cannot be inferred reliably from it.

A Product Quality Requirement follows the same authority rule. When an
external requirements, policy, compliance, or service-objective system owns
the accepted statement, the architecture corpus SHOULD link it and own only
the durable architectural response. When the architecture corpus owns the
requirement, it SHOULD link rather than copy current targets, test detail,
evaluation results, and telemetry. An implementation property or observed
measure is evidence, not accepted desired state by itself.

Each present collection MUST have an `index.md` that states its grouping rule,
links its immediate concepts or narrower collections, uses canonical titles
and descriptions, and remains navigational. Every maintained concept MUST be
reachable from the bundle root.

Changing a classification or structural owner can change a path and therefore
an OKF concept ID. Treat that change as a migration: update the canonical
concept, indexes, inbound links, affected views and evidence, and `log.md`.
Use a host-supported redirect or deprecated route when needed; do not keep two
independently maintained copies.

This software architecture knowledge bundle owns the profile. Increment the
profile version whenever a normative requirement changes and document any
migration required of conforming documentation sets.

Version 0.7.0 makes profile adoption explicit, requires each C4 Container to
identify exactly one containing C4 Software System, and states the source
access prerequisite for exact ISO/IEC 25010:2023 subcharacteristic
classification. A set migrating from version 0.6.0 MUST:

1. add an explicit adoption sentence with the `software-architecture-docs`
   profile identity and version `0.7.0` to its root `index.md`;
2. review every maintained C4 Container and identify exactly one containing
   C4 Software System, updating related navigation or views when needed; and
3. ensure authors and validators of Product Quality Requirements have lawful
   access to the exact ISO/IEC 25010:2023 subcharacteristic vocabulary.

No canonical path or profile-defined metadata migration is otherwise required.

Version 0.6.0 adds Product Quality Requirement as the sole first-class product
quality concept and classifies each named requirement beneath `quality/` using
ISO/IEC 25010:2023. A set migrating from version 0.5.1 MUST:

1. review any maintained “quality concern” material and migrate only an
   accepted, assessable, architecture-significant outcome to one named Product
   Quality Requirement;
2. retain unresolved material with its need, risk, proposal, decision, or
   external requirements authority, and remove generic taxonomy prose or
   copied implementation facts that do not pass the admission test;
3. create only the characteristic and subcharacteristic collections earned by
   admitted requirements, choose one canonical primary classification for
   each requirement, and update navigation and inbound links; and
4. keep system-level quality priorities and tradeoffs in the existing overview
   or canonical software-system concept rather than introducing Product
   Quality View or Quality Concern types.

Version 0.5.1 makes material exclusions explicit for C4 Software System
concepts. This aligns the normative profile with the existing authoring guide
and requires no path or metadata migration.

Version 0.4.0 makes human comprehension, stable concept identity, semantic
delta, and system lifecycle and stewardship explicit corpus-wide requirements.
A set migrating from version 0.3.0 MUST:

1. identify the system lifecycle or support state, maintenance and
   decision-authority route, and review triggers in its overview or canonical
   system-of-interest concept, directly or by stable links;
2. review plural inventory documents for independently addressable concepts and
   migrate each admitted concept to its canonical named path without retaining
   parallel copies; and
3. remove repeated container or component ownership and lifecycle context when
   it merely duplicates the containing system, retaining only consequential
   exceptions.

Version 0.3.0 separates Use Case from the demand-and-value collection, adds its
minimum behavioral body contract, narrows Feature admission, defines
author-facing cross-view relationship meanings, and strengthens dynamic-view
scenario requirements. A set migrating from version 0.2.0 MUST move each
`value/use-cases/<use-case>.md` concept to `use-cases/<use-case>.md`, update
indexes and inbound links, and preserve one authoritative document rather than
maintaining compatibility copies. Existing Use Case, Feature, and dynamic-view
bodies MUST be reviewed against their revised requirements.

Version 0.2.0 added the optional `value/` view and its six concept types. A
documentation set conforming to version 0.1.0 that maintains none of these
concepts requires no content migration. A set adopting version 0.2.0 for
existing value concepts MUST move or map each concept to its canonical type and
path, update indexes and inbound links, and preserve one authoritative document
rather than maintaining compatibility copies.

## Validation

No executable profile validator is currently defined. Until one exists,
profile validation is manual and MUST name the rules examined. An applicable
OKF v0.2 validator SHOULD establish the separate base-conformance result.

Profile validation MUST check:

- an explicit root-index adoption sentence naming the
  `software-architecture-docs` profile identity and adopted version;
- exact use of the seventeen concept types defined here;
- required common fields;
- canonical placement of each applicable concept;
- a named canonical file from first admission for each independently
  addressable concept and absence of plural catch-all concept inventories;
- sibling placement of Offering, Audience, Need, Job to Be Done, and Value
  Proposition concepts beneath `value/`;
- placement of Use Case concepts beneath `use-cases/` and presence of their
  subject boundary, primary actor role, goal, and successful outcome;
- absence of action-sized fragments represented as Use Case concepts;
- an independent behavioral identity for every maintained Feature rather than
  a paraphrase of one Use Case;
- absence of private individuals or customers as Audience concepts in a public
  architecture corpus;
- placement of each Product Quality Requirement beneath one primary
  ISO/IEC 25010:2023 characteristic and subcharacteristic, with a stable named
  requirement file and no duplicate copies beneath secondary classifications;
- presence in every Product Quality Requirement of its target, conditions,
  required outcome, primary classification, architecture significance and
  consequences, and assessment criterion or authoritative evidence route;
- absence of Product Quality View and Quality Concern as profile types, empty
  quality-taxonomy collections, substantive characteristic indexes, and
  plural quality-requirement catch-all documents;
- absence of Product Quality Requirements inferred solely from implementation
  or observation, shadowing an external requirement authority, or containing
  invented targets;
- a valid Subdomain `classification` matching its directory;
- absence of `classification` on Bounded Context and Context Map concepts;
- sibling placement of subdomains, bounded contexts, and context maps;
- valid C4 View `view_type`, stated scope, and view-specific requirements,
  including one named behavior and scenario for each dynamic view;
- exactly one containing C4 Software System for every C4 Container;
- exactly one owning C4 Container for every C4 Component;
- no recursive C4 Container or C4 Component containment;
- absence of C4 Component typing on shared modules without one owning
  container;
- discoverable system lifecycle or support state, maintenance and
  decision-authority route, and architecture-documentation review triggers;
- absence of copied volatile stewardship records and repeated container or
  component lifecycle context without a consequential exception;
- evidence links or generated routes, rather than manually duplicated current
  realization inventories; and
- reachability from the root index.

Profile validation SHOULD also check that consequential cross-view links state
an author-facing relationship meaning defined above. Relationship frontmatter,
identifiers, machine-readable source and target constraints, direction, and
reciprocity remain outside profile validation in version 0.7.0.

The [minimal conforming architecture corpus](minimal-conforming-architecture-corpus.md)
provides a complete synthetic example and a dated manual conformance report
covering the applicable base and profile rules.

[^okf-v0.2]:
    OKF v0.2 defines concept IDs from bundle-relative paths,
    reserves `index.md` and `log.md`, leaves `type` vocabularies and directory
    organization to producers, and uses ordinary Markdown links.

[^okf-profile-proposal]:
    The opt-in OKF profile proposal remains open, so this
    profile uses the application-profile layering model provisionally without
    changing base OKF conformance.

[^dcmi-application-profile]:
    DCMI defines an application profile as a
    specification that selects metadata terms and adds constraints for
    application-specific requirements.

[^just-enough-architecture-docs]:
    Just Enough Architecture Docs defines the
    admission, authority, concern-view, and maintenance principles on which
    this profile builds.

[^capabilities]:
    Capabilities in software architecture distinguishes stable
    abilities from recognizable features, actor-facing surfaces, domain
    meaning, structural realization, and delivery work.

[^goal-oriented-behavior]:
    Goal-oriented behavior and use cases distinguishes
    contextual actors, goals, scenarios, extensions, and delivery artifacts
    while connecting use cases to the architecture views they exercise.

[^product-quality]:
    Product quality in software architecture distinguishes
    stakeholder quality needs, ISO/IEC 25010 classifications, accepted Product
    Quality Requirements, architectural responses, and assessment evidence.

[^iso-25010]:
    ISO/IEC 25010:2023 defines nine product quality characteristics
    and their subcharacteristics as a reference for specifying, measuring, and
    evaluating ICT and software product quality.

[^iso-25030]:
    ISO/IEC 25030:2019 defines a framework for eliciting stakeholder
    quality needs and defining, analyzing, using, and governing quality
    requirements categorized by applicable quality models.

[^offerings-and-value]:
    Offerings and value in software architecture
    distinguishes demand and offered value from goal-oriented behavior,
    capabilities, features, domain meaning, structural realization, and
    delivery work.

[^jobs-to-be-done]:
    Jobs to Be Done defines circumstances, sought progress,
    forces, evidence expectations, job mapping, and the boundaries from
    solution-side architecture concepts applied by this profile.

[^domain-driven-design]:
    Domain-driven design distinguishes classified
    subdomains from bounded contexts, permits many-to-many mappings between
    them, and assigns inter-context views to context maps.

[^c4-model]:
    The C4 model explanation defines the abstraction hierarchy, view
    types, containment rules, notation expectations, and selective-use
    guidance applied by this profile.

[^architecture-docs-organization]:
    Organizing an architecture docs corpus
    defines the subject-first collections and progressive-disclosure rules
    whose governed subset this profile makes independently checkable.
