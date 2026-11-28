---
type: Pattern
title: Pattern collection
description: When readers need to choose among related patterns, offer routes from their situations to useful choices, explain complementary or opposing responses, and maintain shared knowledge through feedback from use.
tags: [docs, documentation-pattern, pattern-collection, pattern-language, relationships, curation]
status: draft
generated: { by: codex/gpt-6, at: 2026-11-22T02:15:25Z }
sources:
  - id: catalog
    resource: https://microservices.io/patterns/index.html
    title: Chris Richardson — A pattern language for microservices
  - id: group-works
    resource: https://groupworksdeck.org/patterns_by_category
    title: Group Works — Patterns by Category
  - id: counterbalance
    resource: https://alistaircockburn.com/Talk%202023-10%20PLOP%2030%20yrs%20patterns.pdf
    title: Alistair Cockburn — The take-home value of a pattern is its name
  - id: value
    resource: https://wirfs-brock.com/rebecca/papers/valueofpatterncollections/
    title: Wirfs-Brock and Hvatum — The Value of Pattern Collections (2026 preprint)
---

# Pattern collection

Use a pattern collection when readers face a related set of design choices
and have trouble finding a starting point or deciding which response fits.
An individual [pattern description](pattern-description.md) owns the
meaning, examples, and evidence for its design. The collection earns its
keep when its organization and account of the relationships help a reader
make a decision that the separate descriptions leave open.

## Where the design pays for itself

A team with one well-understood problem may need only a link to one good
description. If colleagues already know which name they want, a name
index can be enough. A route by situation earns its maintenance cost
when readers know the problem but need to compare responses. Chris Richardson’s
microservices catalog groups entries under questions about architecture,
service boundaries, and collaboration. An engineer choosing how to
decompose a service can see alternatives before learning their
names.[^catalog]

Group Works organizes facilitation patterns by needs that arise in
meetings. Someone looking for ways to make sense of a discussion can
find *Distilling* and *Harvesting* under *Inquiry & Synthesis*. Someone
who already knows either name can use the alphabetical index. Both
routes lead to the same entry. Whether facilitators find the right help
for a particular gathering is a question to try with them.[^group-works]

## Costs and tensions

A collection can preserve genuine disagreement. Alistair Cockburn pairs
*Osmotic Communication* and *Cone of Silence* to show patterns pulling in
opposite directions. Someone weighing colleagues’ need to hear each other
against their need for uninterrupted work can use that tension. A name
index alone leaves the practitioner to discover it.[^counterbalance]

Each extra entry or view brings maintenance costs. A precise-looking map
can conceal gaps in coverage or give a candidate pattern the appearance
of proven use. Comparable previews help readers choose when they preserve
the conditions behind different advice. A claim to offer a *language*
also calls for cohesive coverage of its stated field. Readers need to see
how one decision opens or changes the next as they develop a design.
Cross-links help people browse. A stronger claim needs a case showing
how the relationships helped someone develop a design.

The collection’s value can differ for the author, the practitioner, and
the people who live with the resulting design. Wirfs-Brock and Hvatum’s
2026 preprint considers these interests across the life of a collection.
The proposed design draws on those experiences. Its usefulness for a new
audience depends on the choices and outcomes observed there.[^value]

[What connects the patterns in a collection](../explainers/pattern-collection.md)
follows a sequence of design decisions as a team grows. For developing,
trying, and maintaining your own collection, see
[How to curate a pattern collection](../guides/curating-a-pattern-collection.md).

[^catalog]: Chris Richardson, [A pattern language for microservices](https://microservices.io/patterns/index.html).
[^group-works]: Group Works, [Patterns by Category](https://groupworksdeck.org/patterns_by_category), with a link to its name index.
[^counterbalance]: Alistair Cockburn, [PLoP 2023 talk, slide 27](https://alistaircockburn.com/Talk%202023-10%20PLOP%2030%20yrs%20patterns.pdf#page=27).
[^value]: Rebecca Wirfs-Brock and Lise Hvatum, [The Value of Pattern Collections](https://wirfs-brock.com/rebecca/papers/valueofpatterncollections/), preprint.
