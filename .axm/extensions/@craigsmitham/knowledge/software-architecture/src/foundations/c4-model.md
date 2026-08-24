---
type: Explanation
title: C4 model
description: How the C4 model uses hierarchical abstractions and selected diagrams to communicate software structure at different levels of detail, and where it needs complementary architecture views.
tags:
  [
    c4-model,
    software-system,
    system-context,
    containers,
    components,
    code,
    offerings,
    architecture-diagrams,
    dynamic-diagram,
    deployment-diagram,
  ]
status: draft
sources:
  - id: c4-model
    resource: https://c4model.com/
    title: The C4 model for visualising software architecture
  - id: c4-abstractions
    resource: https://c4model.com/abstractions
    title: C4 model — Abstractions
  - id: c4-component
    resource: https://c4model.com/abstractions/component
    title: C4 model — Component
  - id: c4-diagrams
    resource: https://c4model.com/diagrams
    title: C4 model — Diagrams
  - id: c4-notation
    resource: https://c4model.com/diagrams/notation
    title: C4 model — Notation
  - id: c4-faq
    resource: https://c4model.com/faq
    title: C4 model — Frequently asked questions
  - id: goal-oriented-behavior
    resource: goal-oriented-behavior.md
    title: Goal-oriented behavior and use cases
generated:
  by: codex/gpt-5.6
  at: 2026-08-21T22:12:04Z
---

# C4 model

The C4 model is an abstraction-first approach to visualizing software
architecture. It gives people a shared structural vocabulary and a related set
of diagrams, allowing them to zoom from a software system's environment into
its implementation without mixing levels of detail.[^c4-model]

The name comes from its four core static diagrams: **system context**,
**container**, **component**, and **code**. C4 is notation- and
tooling-independent. It is a way to describe and communicate software
structure, not a complete architecture or software-delivery method.

## The abstraction hierarchy

C4 describes software through four nested abstractions:

```text
software system
└── container
    └── component
        └── code
```

People interact with software systems but are not another containment level.
The abstractions have specific meanings:[^c4-abstractions]

| Abstraction         | Meaning                                                                                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Person**          | A human actor, role, or persona that uses a software system.                                                                                                     |
| **Software system** | The highest-level software boundary being described; it delivers value to people or other systems.                                                               |
| **Container**       | An application or data store inside a software system, such as a server application, browser application, mobile application, batch process, or database schema. |
| **Component**       | A grouping of related functionality encapsulated behind a well-defined interface inside one container.                                                           |
| **Code**            | The classes, interfaces, objects, functions, tables, or other implementation elements that realize a component.                                                  |

A C4 container is not necessarily a Docker or operating-system container. It
is an application or data-store boundary; its mapping to infrastructure belongs
in a deployment view. A C4 component is not a separately deployable service or
an arbitrary package: it executes and is deployed as part of its owning
container.[^c4-component]

## The diagram set

Each core diagram holds one scope and primary abstraction level steady:

| Diagram            | Scope and question                                                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| **System context** | One software system: who uses it, what surrounds it, and which external systems it interacts with.                           |
| **Container**      | One software system: which applications and data stores it contains, what each is responsible for, and how they communicate. |
| **Component**      | One container: how its architecturally significant functionality is partitioned.                                             |
| **Code**           | One component: which implementation elements realize it.                                                                     |

These diagrams form a zoom sequence, but they are not a mandatory checklist.
The official guidance says system-context and container diagrams are sufficient
for most teams; component and code diagrams should be added only when they
provide useful detail. Code views are particularly likely to become stale and
are usually better generated on demand.[^c4-diagrams]

C4 also defines three supporting diagram types:

| Diagram              | What it adds                                                                                                     |
| -------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **System landscape** | People and software systems across an enterprise, organization, or another broad scope.                          |
| **Dynamic**          | The ordered collaboration of existing C4 elements for one selected scenario of a feature, use case, or behavior. |
| **Deployment**       | Instances of software systems and containers mapped to infrastructure for a named environment.                   |

Dynamic and deployment diagrams add behavioral and operational perspectives;
they do not add more levels to the static containment hierarchy.

A useful dynamic view names the behavior and one scenario it illustrates, the
initiator and outcome, and the ordered interactions among canonical elements.
When it illustrates a use case, distinguish its main success scenario from a
named extension. The use case owns the goal-oriented behavioral context; the
dynamic view owns only the selected collaboration.[^goal-oriented-behavior]

## One model, selected views

The useful unit is a consistent model of named elements and relationships, not
a required stack of pictures. Each diagram selects the elements needed to
answer one question for one audience. An element that appears in several views
should keep the same name, type, responsibility, and relationship meaning.

Although C4 does not prescribe visual notation, a diagram still needs to be
self-describing. The official notation guidance calls for:[^c4-notation]

- a title that identifies the diagram type and scope;
- an explicit type, name, and short responsibility for each element;
- relevant technology for containers and components;
- directional relationships labelled with their intent;
- protocols or technologies for material inter-container communication; and
- a legend for shapes, colors, line styles, or other visual conventions.

This discipline is what distinguishes C4 from an ambiguous collection of boxes
and arrows.

## Scope and complementary views

C4 primarily explains the static structure of a software system. Its dynamic
and deployment diagrams answer selected supporting questions, but C4 does not
model every architectural concern. It does not define a design process, team
structure, business process, domain model, state machine, data model, quality
requirement, or strategic choice.[^c4-faq]

Other architecture views therefore remain necessary:

- [Domain-driven design](domain-driven-design.md) explains domain meaning,
  language, subdomains, bounded contexts, and authority boundaries.
- [Wardley mapping](wardley-mapping.md) relates user need, dependency,
  evolution, and inertia to strategic choices.
- [Offerings and value in software architecture](offerings-and-value.md)
  explains the demand and coherent value that structure may help realize.
- [Goal-oriented behavior and use cases](goal-oriented-behavior.md) connects
  actor goals and selected scenarios to structural responsibilities.
- [Capabilities in software
  architecture](capabilities.md) describes outcomes,
  recognizable behavior, and actor-facing interaction points.
- [Just Enough Architecture
  Docs](../architecture-documentation/just-enough-architecture-docs.md) explains
  how stakeholder concerns select the functional, quality, operational, and
  other views needed to explain why the structure exists.

A C4 software system, container, or component is not automatically an
offering, product, capability, subdomain, bounded context, team, repository, or
deployment node.
Those concepts can align in a particular architecture, but their relationships
must be stated rather than inferred from the C4 hierarchy. Likewise, shared
code used by several containers is a code dependency, not a global C4
component; a C4 component belongs to one container.

When representing maintained C4 elements and views in an OKF bundle, apply the
[Software architecture docs application
profile](../architecture-documentation/software-architecture-application-profile.md)
for their types, metadata, paths, containment, validation rules, and
author-facing cross-view relationship meanings. Structured relationship
frontmatter remains deferred.

Use the focused guides for [software
systems](../guides/documenting-c4-software-systems.md),
[containers](../guides/documenting-c4-containers.md),
[components](../guides/documenting-c4-components.md), and
[views](../guides/documenting-c4-views.md) when authoring one artifact.

[^c4-model]:
    The official C4 overview defines the hierarchical abstractions,
    core and supporting diagrams, and notation- and tooling-independent stance.

[^c4-abstractions]:
    The official abstraction guide defines software systems,
    containers, components, code, and the role of people.

[^c4-component]:
    The official component definition distinguishes components
    from separately deployable units and implementation packaging.

[^c4-diagrams]:
    The official diagram guide distinguishes four core static
    diagrams from three supporting diagrams and recommends using only the
    views that add value.

[^c4-notation]:
    The official notation guide describes how to make diagrams
    self-describing despite C4's notation independence.

[^c4-faq]:
    The official FAQ states that C4 focuses on describing software
    structure and does not imply a delivery process or replace complementary
    domain, process, state, and data models.

[^goal-oriented-behavior]:
    Goal-oriented behavior and use cases distinguishes
    the behavioral context owned by a use case from the selected collaboration
    owned by a dynamic view.
