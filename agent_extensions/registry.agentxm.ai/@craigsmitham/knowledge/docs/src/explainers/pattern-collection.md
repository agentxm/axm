---
type: Explainer
title: What connects the patterns in a collection
description: How a collection lets readers discover, compare, and combine patterns, and when the relationships give them a language for designing something of their own.
tags: [docs, pattern-collection, pattern-language, discovery, relationships, curation]
status: draft
generated: { by: codex/gpt-6, at: 2026-11-22T01:49:36Z }
sources:
  - id: bluebird
    resource: https://wirfs-brock.com/rebecca/papers/magicbacklog2017/
    title: Hvatum and Wirfs-Brock — Pattern Stories and Sequences for the Backlog
  - id: readers
    resource: https://wirfs-brock.com/rebecca/papers/whowillread/
    title: Wirfs-Brock and Hvatum — Who Will Read My Patterns?
  - id: generativity
    resource: https://wirfs-brock.com/rebecca/papers/explrgenpat2023/
    title: Hvatum and Wirfs-Brock — Exploring the Generative Nature of Patterns
---

# What connects the patterns in a collection

A pattern collection can show when one design choice makes another
worth considering. Lise Hvatum and Rebecca Wirfs-Brock illustrate that
relationship through Bluebird, their fictional software project. Its team
keeps a backlog, a record of work the product needs. In the authors’
*Frame* pattern the team organizes that work around features its users
recognize. That makes it easy to ask what it will take to deliver a
feature. Where, though, does an engineer put work on a communications
layer shared by several features? *Views* gives the engineer another way
to organize those items, this time around the architecture. An alphabetical
index could tell someone where to find either name. The story explains
what happened to make the second design useful after the first.[^bluebird]

A **pattern collection** brings descriptions of recurring design decisions
together for people working in a field. The individual description carries
the knowledge behind a particular choice. A collection can add knowledge
about the space between choices. In Bluebird, organizing the backlog raises
a further question about who needs to see which parts. A different team
could start with that question on its first day.

## Several ways in

A practitioner who remembers *Views* can go straight to its description.
A colleague might arrive knowing only that shared technical work is hard
to find under any one feature. A newcomer may first need the story to recognize
that both are talking about the same decision. A name index, a map of
reader questions, and a story can all lead to one maintained description.
Their value depends on which of these readers is standing at the door.

In *Who Will Read My Patterns?*, Wirfs-Brock and Hvatum examined books and
asked readers about their experiences before designing ways into their own
material. This matters because an experienced practitioner may know the
problem intimately yet have no reason to know the collection’s names.[^readers]

## When a collection becomes a language

Some collections help a reader choose a single response and carry it
away. A **pattern language** makes a further claim. The relationships
help people develop a whole design by making successive decisions. One
choice opens possibilities, exposes a tension, or prompts reconsideration
of an earlier choice. The sequence can change with the work. Bluebird’s
growth sends the team back to its original structure. Even with several
such sequences to show, the authors judged in their 2017 paper that it
was too early to call their backlog collection a language.[^bluebird]

There are also choices a designer should decline. In their paper on
generativity, Hvatum and Wirfs-Brock describe planning a home for a
family with birds that fly loose indoors. A published pattern for indoor
windows posed a hazard for those birds. The ability to recognize a poor
fit, adapt a design, and draw on knowledge outside the collection is part
of using the language well.[^generativity]

To develop the routes and relationships for a specific audience, see
[How to curate a pattern collection](../guides/curating-a-pattern-collection.md).

[^bluebird]: Lise B. Hvatum and Rebecca Wirfs-Brock, [Pattern Stories and Sequences for the Backlog](https://wirfs-brock.com/rebecca/papers/magicbacklog2017/).
[^readers]: Rebecca Wirfs-Brock and Lise Hvatum, [Who Will Read My Patterns?](https://wirfs-brock.com/rebecca/papers/whowillread/).
[^generativity]: Lise Hvatum and Rebecca Wirfs-Brock, [Exploring the Generative Nature of Patterns](https://wirfs-brock.com/rebecca/papers/explrgenpat2023/).
