---
type: Explanation
title: Wardley mapping
description: How Wardley Mapping combines user needs, dependency, and evolution to make strategic assumptions challengeable, and how maps can inform—but not replace—architecture decisions.
tags: [wardley-mapping, situational-awareness, value-chain, user-needs, dependency, evolution, movement, inertia, doctrine, gameplay, strategic-architecture]
status: draft
sources:
  - id: wardley-strategy-cycle
    resource: https://medium.com/wardleymaps/on-being-lost-2ef5f05eb1ec
    title: "Simon Wardley — On being lost: Chapter 1"
  - id: wardley-map-grammar
    resource: https://medium.com/wardleymaps/finding-a-path-cdb1249078c0
    title: "Simon Wardley — Finding a path: Chapter 2"
  - id: wardley-evolution
    resource: https://medium.com/wardleymaps/finding-a-new-purpose-8c60c9484d3b
    title: "Simon Wardley — Finding a new purpose"
  - id: wardley-doctrine
    resource: https://medium.com/wardleymaps/doctrine-8bb0015688e5
    title: "Simon Wardley — Doctrine: Chapter 4"
  - id: wardley-inertia
    resource: https://medium.com/wardleymaps/i-wasnt-expecting-that-dcfe122a2234
    title: "Simon Wardley — I wasn't expecting that: Chapter 10"
  - id: wardley-mapping-introduction
    resource: https://learnwardleymapping.com/introduction/
    title: Learn Wardley Mapping — Introduction
  - id: wardley-limitations
    resource: https://www.dannybuerkli.com/2025/02/02/where-the-map-ends
    title: "Danny Buerkli — Where the map ends: understanding Wardley maps' limitations"
generated:
  by: codex/gpt-5.6
  at: 2026-08-21T23:53:22Z
---

# Wardley mapping

Wardley Mapping is a strategic sensemaking practice for improving situational
awareness before choosing action. A **Wardley map** represents a chain of
components that satisfy a user need, connects those components by dependency,
and positions each one according to its stage of evolution.[^wardley-map-grammar]

The map makes assumptions about a landscape visible and challengeable. It is
not a forecast, roadmap, architecture diagram, or decision engine. **Wardley
Mapping** is also broader than the map itself: it places the landscape within
an iterative strategy cycle of purpose, landscape, climate, doctrine, and
leadership.[^wardley-strategy-cycle]

## The map

A Wardley map combines two axes and a dependency graph:

```text
more visible to the user
           ↑
      user need
           │
       capability
           │
       dependency
           │
less visible

           genesis ─ custom-built ─ product/rental ─ commodity/utility
                                  evolution →
```

The map has four essential parts:

| Part | Meaning |
| --- | --- |
| **Anchor** | A user or stakeholder and the need that defines the map's point of view. |
| **Components** | The activities, practices, data, knowledge, or other capabilities needed to satisfy that need. |
| **Dependency** | A higher component needs a lower component for the mapped outcome. |
| **Evolution** | Each component is positioned from genesis to commodity according to how ubiquitous and well understood it is. |

The vertical position expresses visibility to the chosen user, not
organizational rank, architectural layering, implementation order, or general
importance. A deeply enabling component may be nearly invisible to the user
and still be critical. Changing the user, need, or scope can therefore produce
a different—but equally legitimate—map.[^wardley-mapping-introduction]

## Evolution

The horizontal axis describes how the nature of a component changes:

| Stage | Characteristic situation |
| --- | --- |
| **Genesis** | Novel, rare, uncertain, and poorly understood; exploration dominates. |
| **Custom-built** | Bespoke for a particular context, uncommon, and still changing as understanding grows. |
| **Product or rental** | Repeatable, increasingly defined, offered through a developing market, and differentiated by features or service. |
| **Commodity or utility** | Widespread, standardized, well understood, and increasingly competed through scale and operational efficiency. |

Evolution is not age, delivery progress, adoption of one product, or a maturity
score. Wardley's model distinguishes **evolution**—a component changing in
ubiquity and certainty—from **diffusion**—a particular version spreading
through a market over time. The evolution axis has no calendar scale, so it can
support anticipation but cannot establish when a change will occur.[^wardley-evolution]

Rightward is not inherently better. Novel components can be the source of
learning and differentiation; industrialized components can create
concentration, switching, resilience, or regulatory risks. The stage changes
the character of uncertainty and the operating methods likely to fit, but it
does not prescribe one sourcing model, technology, process, or team structure.

Positions are estimates based on observable characteristics and the mapping
group's knowledge. Movement arrows express hypotheses about expected or
intended change. They are invitations to seek evidence and disagree, not
measurements made precise by drawing coordinates.

## The wider strategy cycle

Wardley's strategy cycle separates kinds of reasoning that are often collapsed
into one plan:[^wardley-strategy-cycle]

| Factor | Question |
| --- | --- |
| **Purpose** | What game are we playing, for whom, and why? |
| **Landscape** | What is the current position and dependency structure? The map represents this factor. |
| **Climate** | Which external patterns and forces act on the landscape regardless of our preference? |
| **Doctrine** | Which generally useful ways of operating should improve our ability to act? |
| **Leadership** | Which context-specific choices or plays will we make here? |

Climate, doctrine, and gameplay are not additional map axes. Climate describes
patterns to test against the landscape; doctrine describes practices intended
to work broadly, while their application remains contextual; leadership makes
the particular strategic choice.[^wardley-doctrine]

Expected movement may meet **inertia**: resistance associated with past
success, investment, contracts, skills, identity, incentives, or operating
models. Inertia is not automatically irrational. It may reveal a transition
cost, protected good, or constraint that a simple evolution narrative missed.
Mapping makes the source and consequence of resistance discussable; it does
not make overcoming it the correct choice.[^wardley-inertia]

## From a map to architecture

A Wardley-map component means “something required in this chain of needs.” It
is not the same concept as a business capability, DDD subdomain or bounded
context, C4 component or container, team, service, or repository. Any of those
may appear when relevant, alongside practices, data, knowledge, suppliers, or
other dependencies that have no runtime boundary.

A map can inform architecture questions such as:

- where custom investment supports a differentiating user need;
- which dependency should remain replaceable or reversible;
- where incompatible rates of change need an isolating boundary;
- how a supplier, standard, or utility shift affects resilience and authority;
- which transition requires coexistence, migration, or an exit path; and
- where inertia makes an apparently simple change costly.

The map does not answer those questions alone. A defensible path keeps four
layers distinct:

1. **Mapped hypothesis** — user need, dependency, evolution position, expected
   movement, climate, or inertia.
2. **Strategic choice** — where to invest, standardize, source, migrate,
   preserve optionality, or seek advantage.
3. **Architectural consequence** — the accepted boundary, interface,
   ownership, dependency direction, resilience measure, or reversibility
   requirement produced by that choice.
4. **Evidence and review** — what supports the hypothesis and what change
   should reopen the choice.

Keep time-sensitive maps and contested positions with strategy or discovery
material. Preserve only accepted, durable consequences in the architecture
documents that own them, linking back to the strategic evidence when it
remains useful.

## Limits and responsible use

A map is a deliberately partial model. It can omit an unknown dependency,
reflect the biases of its authors, choose the wrong user or resolution, or
become stale as the environment changes. Practitioner critiques also note that
a map cannot reveal novel components its authors do not yet perceive and that
its usefulness depends heavily on the chosen scope.[^wardley-limitations]

A maintained strategic map should therefore identify its question, user and
need, observation date, accountable owner, material evidence, contested
placements, anticipated movement, inertia, and review trigger. Alternative
maps are preferable to false consensus when a disputed assumption would change
the decision.

Common misreadings include:

- treating the map as a technology inventory without a user need;
- reading evolution as a roadmap, maturity model, or quality score;
- deriving build-versus-buy or team design mechanically from a stage;
- treating coordinates as measurements or predictions;
- replacing domain, structural, process, or quality models with the map; and
- preserving a workshop snapshot after its evidence has expired.

Use [Capabilities in software
architecture](capabilities.md) for outcome and interaction
meaning, [Domain-driven design](domain-driven-design.md) for semantic and
authority boundaries, the [C4 model](c4-model.md) for software structure, and
[Product quality in software architecture](product-quality.md) for the
accepted product quality requirements and architectural constraints that
strategic choices must satisfy.

[^wardley-map-grammar]: Wardley's introductory mapping chapter constructs a
    value chain from user needs and dependencies, then maps its components
    against genesis, custom-built, product, and commodity evolution.
[^wardley-strategy-cycle]: Wardley's opening chapter describes an iterative
    strategy cycle of purpose, landscape, climate, doctrine, and leadership.
[^wardley-mapping-introduction]: Learn Wardley Mapping, an independent
    community reference, distinguishes Wardley Mapping from a Wardley map and
    defines the map as a user-anchored dependency chain positioned by
    evolution.
[^wardley-evolution]: Wardley's evolution discussion distinguishes evolution
    from diffusion and time, explains placement through ubiquity and certainty,
    and describes current maps as estimates open to bias and challenge.
[^wardley-doctrine]: Wardley's doctrine chapter distinguishes broadly useful
    operating principles from climate and context-specific gameplay.
[^wardley-inertia]: Wardley's treatment of inertia relates resistance to forms
    of lost capital, established practice, uncertainty, and transition.
[^wardley-limitations]: Buerkli's practitioner analysis highlights dependence
    on mapper knowledge, selected scope and resolution, and the inability to
    map novel components that have not been perceived.
