---
type: Pattern
title: Pattern collection
description: When readers need to choose among related patterns, offer routes from their situations to useful choices, explain complementary or opposing responses, and maintain shared knowledge through feedback from use.
tags:
- docs
- pattern
- documentation-pattern
- pattern-collection
- pattern-language
- discovery
- relationships
- curation
- maintenance
- authoring
status: draft
sources:
- id: cockburn-patterns-2023
  resource: https://alistaircockburn.com/Talk%202023-10%20PLOP%2030%20yrs%20patterns.pdf
  title: Alistair Cockburn — The take-home value of a pattern is its name (PLoP 2023 talk)
- id: who-will-read
  resource: https://wirfs-brock.com/rebecca/papers/whowillread/
  title: Rebecca Wirfs-Brock and Lise Hvatum — Who Will Read My Patterns? (revised 2021)
- id: pattern-stories
  resource: https://wirfs-brock.com/rebecca/papers/magicbacklog2017/
  title: Lise Hvatum and Rebecca Wirfs-Brock — Pattern Stories and Sequences for the Backlog
- id: value-of-pattern-collections
  resource: https://wirfs-brock.com/rebecca/papers/valueofpatterncollections/
  title: Rebecca Wirfs-Brock and Lise Hvatum — The Value of Pattern Collections (2026 preprint)
- id: generative-patterns
  resource: https://wirfs-brock.com/rebecca/papers/explrgenpat2023/
  title: Lise Hvatum and Rebecca Wirfs-Brock — Exploring the Generative Nature of Patterns
- id: microservices-patterns
  resource: https://microservices.io/patterns/index.html
  title: Chris Richardson — A pattern language for microservices
- id: integration-patterns
  resource: https://www.enterpriseintegrationpatterns.com/patterns/messaging/IdempotentReceiver.html
  title: Gregor Hohpe and Bobby Woolf — Idempotent Receiver and collection navigation
- id: pattern-description
  resource: pattern-description.md
  title: Pattern description
- id: documentation-organization
  resource: ../guides/organizing-and-naming-documentation.md
  title: Organizing and naming documentation
generated: { by: codex/gpt-6, at: 2026-11-11T19:52:17Z }
---

# Pattern collection

A **pattern collection** brings related patterns together for an audience.
This documentation pattern concerns how to curate and maintain their
descriptions so readers can find useful choices and understand relationships.

## Design problem and context

Several patterns address related problems, but readers encounter them as
isolated descriptions. They cannot tell which to start with, how the choices
differ, or what to consult when a design introduces another concern. Repeating
every neighboring description inside each page makes the material drift.

Use this pattern when there is a coherent audience and purpose for the set.
One description needs no collection machinery. An arbitrary assortment of
ideas needs a clearer purpose before an elaborate hierarchy will help.

## Collection and language

Use **pattern collection** as the general term for related patterns. A
collection need not cover a whole problem domain or prescribe combinations.
A **pattern language** is a special kind of collection with cohesive coverage
of a declared domain and guidance for combining patterns into larger designs.
Cross-links alone do not establish those properties.

This usage follows Wirfs-Brock and Hvatum's
[The Value of Pattern Collections](https://wirfs-brock.com/rebecca/papers/valueofpatterncollections/).
It does not introduce separate maturity levels for organizing patterns.
Individual entries can have different evidence and lifecycle states within
the same collection.

## Design response and tradeoffs

Curate a useful core for named reader problems. Maintain an authoritative
account of each pattern's meaning and evidence, give readers comparable
previews, and explain relationships where they change a design choice.
Provide complementary summaries, diagrams, and worked stories when they serve
different reading needs; link them to the maintained account instead of creating
competing definitions. Show how someone can use the collection and keep its
evidence and routes current.

- **Coverage versus usefulness:** include enough to address the audience's
  problems without filling speculative gaps merely to complete a taxonomy.
- **Local clarity versus shared context:** make entries understandable on their
  own while linking to shared concepts rather than copying them.
- **Consistency versus distinctiveness:** comparable previews help selection;
  identical outlines must not hide differences in purpose or evidence.
- **Growth versus coherence:** new entries can add useful choices but also
  duplicate names, obscure the conditions behind different advice, and
  increase maintenance.

Readers gain a navigable set of choices and a vocabulary for discussing them.
The collection takes ongoing editorial work. A polished map can suggest
coverage or certainty that the underlying descriptions do not support.

## Ways into the knowledge

Offer routes suited to the intended readers: observed situations for someone
seeking a response, a small introduction for a newcomer, concise lookup for an
experienced practitioner, or a worked story for someone learning how choices
develop. Use only the views the audience needs. Shared context and evidence
remain maintained in one place.

[Who Will Read My Patterns?](https://wirfs-brock.com/rebecca/papers/whowillread/)
uses reader feedback and personas to explore different reading purposes and
behaviors. Its informal investigation supports considering these differences;
it does not establish one universally effective presentation.

## Complementary and opposing responses

Include **counterbalances** where different patterns serve competing needs.
Cockburn's [slide 27](https://alistaircockburn.com/Talk%202023-10%20PLOP%2030%20yrs%20patterns.pdf#page=27)
contrasts Osmotic Communication with Cone of Silence. Explain the conditions
favoring each response. Resolve inconsistent facts and terminology while
preserving meaningful tensions between design choices.

## Author and maintain the collection

1. **Name its audience and purpose.** State the situations readers bring and
   the decisions the collection supports. Start with entries useful to those
   decisions and name material gaps honestly.
2. **Inspect the core entries.** Use
   [Pattern description](pattern-description.md) for mining, evidence,
   authoring, and review. Preserve candidate labels, provenance, and
   uncertainty; membership does not strengthen an entry's evidence.
3. **Create discovery routes.** Preview the problem and response for each
   entry with a useful name and thumbnail. Choose situation, introduction,
   lookup, or story routes as needed. Use names and grouping readers recognize;
   test whether a representative request leads to a suitable choice or a
   visible gap.
   Follow [local organization guidance](../guides/organizing-and-naming-documentation.md).
4. **Explain useful relationships.** Label alternatives, complements,
   counterbalances, predecessors, follow-ons, and specializations in prose.
   Say when and why to follow a link; keep dependencies consistent in both
   directions and clarify conditions that favor opposing strategies.
5. **Demonstrate use.** Show a realistic selection or combination sequence.
   Mark synthetic scenarios as illustrative. Distinguish a reader's ability
   to find an entry from evidence that applying it improves a design.
6. **Maintain the whole.** Assign ownership and a contribution route. Gather
   feedback about recognition, selection, adaptations, limitations, and outcomes.
   Resolve factual and terminological inconsistencies and explain contextual
   tensions before adding more material. Revise or retire entries
   when evidence or conditions change, preserving a replacement or explanation.

These steps are this bundle's editorial synthesis. Wirfs-Brock and Hvatum's
[collection essay](https://wirfs-brock.com/rebecca/papers/valueofpatterncollections/)
informs its emphasis on audience value, ownership, feedback, and continuing
maintenance beyond initial publication.

## Illustrative use

An author assembling guidance for new service operators might begin with
[Tutorial](tutorial.md) for a safe first exercise, then select
[Reference](reference.md) for the facts operators need during work.
If diagnosis is a recurring problem, [Playbook](playbook.md) helps with
assessment; [Runbook](runbook.md) supplies execution for a selected task.

The relationships explain choices without requiring every operator to read
every page or follow one sequence. This is a hypothetical use of the
documentation collection, not evidence of operator outcomes.

The story can revisit earlier choices: a confusing reference may reveal a need
for explanation, while a failed runbook attempt may return the operator to
playbook assessment. Hvatum and Wirfs-Brock's
[Pattern Stories and Sequences](https://wirfs-brock.com/rebecca/papers/magicbacklog2017/)
similarly treats sequences as flexible threads that may repeat or proceed in
parallel. An illustrative combination does not by itself make a collection a
pattern language.

## Review and evidence

Check a few representative reader problems end to end: can readers choose an
entry, understand its applicability, follow relevant relationships, and
recognize when nothing fits? Check agreement between previews and bodies,
between neighboring claims, and between stated evidence and confidence.
Technical link validation supports these checks but cannot replace them.

Make application feedback specific: what situation did the reader recognize,
why did they select the pattern, what did they adapt, and which limitation
became consequential? Record what happened to the resulting design, including
unwanted effects and cases where another response was needed.

Distinguish value to the **author** (learning and clearer communication), the
**practitioner** (better decisions and useful adaptations), and the **people
affected by the design** (the consequences of those decisions). These interests
may differ. This distinction comes from the stakeholder discussion in
[The Value of Pattern Collections](https://wirfs-brock.com/rebecca/papers/valueofpatterncollections/).
Neither publication nor successful lookup alone establishes value in use.

[Microservices.io](https://microservices.io/patterns/index.html) groups patterns
under design questions and supplies short previews. The Enterprise Integration
Patterns site's
[Idempotent Receiver page](https://www.enterpriseintegrationpatterns.com/patterns/messaging/IdempotentReceiver.html)
shows category navigation and related-pattern links. Both illustrate discovery
across related descriptions; their authors also use the term language.
Observing those features does not establish completeness or comparative value.

[Exploring the Generative Nature of Patterns](https://wirfs-brock.com/rebecca/papers/explrgenpat2023/)
examines the difference between publishing a collection and helping people
create useful designs. Use actual application feedback when making outcome
claims. This draft description combines source-informed guidance with observed
documentation features; its full workflow has not been independently evaluated.

## Related

- [Pattern description](pattern-description.md) — owns the conceptual
  distinctions, evidence requirements, anatomy, and review of individual entries.
- [Comparing concepts](../guides/comparing-concepts.md) — keeps recurring
  cross-entry distinctions in one maintained place.
- [Documentation craft](../explainers/documentation-craft.md) — applies this
  collection to documentation choices.
- [Documentation workflow](../explainers/documentation-workflow.md) — supports
  bounded improvements to an existing corpus.
