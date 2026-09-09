---
okf_version: "0.2"
---
# Product engineering

A portable body of knowledge for building software products. Seven lifecycle
sections express an opinionated development practice, from strategy through
operations and maintenance. Foundations supplies the shared concepts that inform
that practice. The lifecycle is iterative, and each section stands alone for a
reader who arrives through search.

This bundle holds portable craft only. Technology bindings that churn with a
framework and neighboring disciplines with their own bundles are referenced
here rather than restated. The
[overview](overview.md) states what else is deliberately left outside, and why.

## Start here

* [Product engineering overview](overview.md) - How the seven lifecycle sections express an opinionated product-development practice, how Foundations supplies shared conceptual context, where concepts belong, and what stays outside the bundle.

## Read across the bundle

- [Reading product engineering](reading-product-engineering.md) — Use when entering the bundle or connecting familiar concepts to the wider practice; follow question-led reading routes through value, strategy, behavior, and change, then branch into the relevant lifecycle guidance.

Choose a route by question: value and evidence, strategic choices, behavior and
commitment, or continuity and change. Each route explains the next reading and
branches into the lifecycle guidance.

- [Northbank Equipment: a product-engineering case](northbank-equipment.md) — A fictional rental business connects customer value, strategic choices, domain behavior, code, tooling, delivery, operation, and continuing care through related episodes with explicit assumptions.

## Shared concepts

* [Foundations](foundations/) - Shared concepts and approaches that inform decisions across the lifecycle; start here to understand the vocabulary and context behind the practice.

## The seven lifecycle sections

* [Where to play](strategy/) - Where should we participate, and how do we win there?
* [What to solve](problem/) - Which problems are worth solving, and what outcome would tell us we succeeded?
* [What to build](solution/) - Which solution concept do we commit to, and how do we state that commitment so others can dispute it?
* [How to build it](engineering/) - How do we construct and verify what we committed to?
* [How to ship it](delivery/) - How does a change reach production safely and predictably?
* [How to run it](operations/) - How does the product stay healthy, secure, and affordable in production?
* [How to maintain it](maintenance/) - What does caring for an existing product involve as its circumstances change?

## How full each section is

The seven lifecycle sections are at very different stages. Five hold concepts and two hold none
yet, and no section is finished. Depth follows where the material came from, not
where it matters most: the two questions a practitioner reaches first are the
two with the least written, since Where to play holds no concepts at all and
What to solve holds two. [Foundations](foundations/) groups the shared
explanations by reader question: value and strategic choice, assumptions and
renewal, customer progress and behavior, design and architectural responsibility,
project commitment, measures and service levels, and maintenance triggers.
A section with no concepts still carries its question,
its scope, and the boundaries that keep its neighbors
honest, so it is worth reading to find out where something belongs, not to find
out how to do it.

| Section | What it holds today |
| --- | --- |
| [Foundations](foundations/) | Shared explanations of value, strategy, design, behavior, project commitments, measurement, and maintenance; question-led selection and comparisons in the foundation index |
| [Where to play](strategy/) | No concepts. Scope and non-responsibilities, with routes to value-based strategy, Playing to Win, Cagan, and Wardley mapping foundations and public strategy sources |
| [What to solve](problem/) | Two concepts: the value and demand model, and outcomes and evidence. The four product risks are stated in the section index; Jobs to Be Done and Cagan's product strategy are linked from Foundations |
| [What to build](solution/) | Requirements craft in depth under [Requirements](solution/requirements/), with shared design grounding through [Buxton](foundations/buxton-design.md); practical design guidance remains unwritten |
| [How to build it](engineering/) | Verification, [codebase review](engineering/codebase-review/), and the repository execution surface; worked Northbank cases connect technical decisions, while general architecture and construction guidance remains unwritten |
| [How to ship it](delivery/) | [Work items](delivery/work-items/); delivery flow, build and release, and delivery automation are not yet written |
| [How to run it](operations/) | Scope and boundaries, with a route to service-level foundations; no local concepts yet |
| [How to maintain it](maintenance/) | An explanation of maintenance through care, continuity, situated understanding, intervention, and responsibility |

## Deeper entry points

Three subtrees are large enough that a reader often wants to land in them
directly rather than through their section.

* [Requirements](solution/requirements/) - Discovering, analyzing, specifying, reviewing, changing, and maintaining requirements.
* [Work items](delivery/work-items/) - Operational Incident Records, Defect Reports, and Changes as durable case records.
* [Codebase review](engineering/codebase-review/) - Outcome-centered review of an existing codebase against ten product-quality pillars and eight cross-cutting records.

## Retrieval

`axm knowledge concepts query` filters by bundle and by tag, and bundle is its
only scope filter. Every concept file therefore carries a section tag matching
its directory, so that a query can be scoped to Foundations or one lifecycle
section: `pe-foundations`, `pe-strategy`, `pe-problem`, `pe-solution`,
`pe-engineering`, `pe-delivery`, `pe-operations`, and `pe-maintenance`. Reserved
`index.md` and `log.md` files carry no section tag,
and neither do concepts at the bundle root, such as the
[overview](overview.md), which belong to no section. The
[overview](overview.md) explains why section membership is carried in metadata
as well as in the path.
