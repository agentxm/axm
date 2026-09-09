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
What to solve holds two. Foundations holds shared explanations of Jobs to Be
Done and domain-driven design. A section with no concepts still carries its
question, its scope, and the boundaries that keep its neighbors honest, so it is
worth reading to find out where something belongs, not to find out how to do it.

| Section | What it holds today |
| --- | --- |
| [Foundations](foundations/) | Jobs to Be Done and domain-driven design; shared conceptual context for the lifecycle |
| [Where to play](strategy/) | No concepts. Scope, non-responsibilities, and the value stick, with the strategy canon routed to its public sources rather than summarized |
| [What to solve](problem/) | Two concepts: the value and demand model, and outcomes and evidence. The four product risks are stated in the section index; Jobs to Be Done is linked from Foundations |
| [What to build](solution/) | Requirements craft in depth under [Requirements](solution/requirements/); the design half of the section is not yet written |
| [How to build it](engineering/) | Verification, [codebase review](engineering/codebase-review/), and the repository execution surface; architecture and construction are not yet written |
| [How to ship it](delivery/) | [Work items](delivery/work-items/); delivery flow, build and release, and delivery automation are not yet written |
| [How to run it](operations/) | Scope and boundaries only; no concepts yet |
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
