---
type: Pattern
title: Pattern description
description: When recurring design experience needs to be shared, name its essential property or strategy and explain context, variation, consequences, and evidence so practitioners can recognize and adapt it.
tags:
- docs
- pattern
- documentation-pattern
- pattern-description
- pattern-mining
- evidence
- forces
- generativity
- review
- authoring
status: draft
sources:
- id: cockburn-patterns-2023
  resource: https://alistaircockburn.com/Talk%202023-10%20PLOP%2030%20yrs%20patterns.pdf
  title: Alistair Cockburn — The take-home value of a pattern is its name (PLoP 2023 talk)
- id: elephants-patterns-heuristics
  resource: https://wirfs-brock.com/rebecca/papers/ElephantsPatternsAndHeuristics/
  title: Rebecca Wirfs-Brock and Christian Kohls — Elephants, Patterns, and Heuristics
- id: generative-patterns
  resource: https://wirfs-brock.com/rebecca/papers/explrgenpat2023/
  title: Lise Hvatum and Rebecca Wirfs-Brock — Exploring the Generative Nature of Patterns
- id: saga
  resource: https://microservices.io/patterns/data/saga.html
  title: Chris Richardson — Saga
- id: harvesting
  resource: https://groupworksdeck.org/patterns/Harvesting
  title: Group Works — Harvesting
generated:
  by: codex/gpt-6
  at: '2026-11-22T02:15:25Z'
---

# Pattern description

Use a pattern description when people have encountered a design problem
repeatedly and readers need to recognize when, why, and how a response
could fit a new setting. A useful name gives practitioners something
specific to discuss. The reader also needs to know the property to seek
or strategy to apply and which choices depend on circumstances.[^cockburn-patterns-2023]

## What justifies the form

A designer seeking a single local procedure can use a [how-to guide](how-to.md).
A team that wishes to state a warranted direction for judgment can write a
[principle document](principle.md). A claim about recurring design experience
carries another obligation. Readers should be able to inspect uses of the
response, compare conditions across them, and judge which consequences
those accounts support.[^elephants-patterns-heuristics] A problem may have
come up repeatedly while the proposed response has only been sketched.
That is grounds for a candidate. Several teams citing the same sketch still
leave the reader looking for an account of a team actually trying it.

This form takes time to investigate and maintain even when the fit is good.
Too much abstraction hides the decision a practitioner needs to make. Too
much incidental detail makes an example look like the only admissible design.
Describing every convenient local convention as a pattern can burden a
collection with names for decisions readers never face elsewhere. The ability
of readers to create useful new realizations is a further claim, one that
requires evidence about application.[^generative-patterns]

## Two observed descriptions

Richardson's *Saga* gives the setting in which services each own their data.
It describes how to coordinate local transactions, presents choreography and
orchestration as alternatives, and names costs including the need to design
compensating actions and account for isolation.[^saga]

Group Works’ *Harvesting* helps a meeting facilitator decide what to
collect and share. A team that needs a record of decisions might use
minutes. A group returning to a discussion might want a visual map of
ideas. The pattern asks who will use the result and for what purpose.
The published examples show how the choice can vary. Whether the selected
record actually helped a group calls for evidence from its use.[^harvesting]

For the relationship between a recurring design, its description, and a
particular realization, read
[What a pattern description lets a designer carry to a new case](../explainers/pattern-description.md).
To mine examples, assess evidence, or revise a draft with a reviewer,
follow [How to write a pattern description](../guides/writing-a-pattern-description.md).
For the design of a resource that helps people choose among several patterns,
see [Pattern collection](pattern-collection.md).

[^cockburn-patterns-2023]: Alistair Cockburn, [2023 PLoP talk, slides 15–24](https://alistaircockburn.com/Talk%202023-10%20PLOP%2030%20yrs%20patterns.pdf#page=15).
[^elephants-patterns-heuristics]: Rebecca Wirfs-Brock and Christian Kohls, [Elephants, Patterns, and Heuristics](https://wirfs-brock.com/rebecca/papers/ElephantsPatternsAndHeuristics/).
[^generative-patterns]: Lise Hvatum and Rebecca Wirfs-Brock, [Exploring the Generative Nature of Patterns](https://wirfs-brock.com/rebecca/papers/explrgenpat2023/).
[^saga]: Chris Richardson, [Saga](https://microservices.io/patterns/data/saga.html).
[^harvesting]: Group Works, [Harvesting](https://groupworksdeck.org/patterns/Harvesting).
