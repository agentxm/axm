# Product engineering knowledge

A portable body of knowledge for building software products. Seven lifecycle
sections express an opinionated development practice, from strategy through
operations and maintenance. Foundations supplies the shared concepts that inform
that practice.

Start at the [discovery map](src/index.md). Open
[Foundations](src/foundations/) for shared explanations of Jobs to Be Done and
domain-driven design, or enter through a lifecycle question below.

| Section | Question |
| --- | --- |
| [Where to play](src/strategy/) | Where should we participate, and how do we win there? |
| [What to solve](src/problem/) | Which problems are worth solving, and what outcome would tell us we succeeded? |
| [What to build](src/solution/) | Which solution concept do we commit to, and how do we state that commitment so others can dispute it? |
| [How to build it](src/engineering/) | How do we construct and verify what we committed to? |
| [How to ship it](src/delivery/) | How does a change reach production safely and predictably? |
| [How to run it](src/operations/) | How does the product stay healthy, secure, and affordable in production? |
| [How to maintain it](src/maintenance/) | What does caring for an existing product involve as its circumstances change? |

The guidance here is technology-agnostic. Anything that churns with a specific
language, framework, or vendor stays in its own bundle, such as `effect-v4`,
and is referenced rather than restated. Citing a tool's documentation as
evidence for a portable claim is not a binding; teaching a reader to operate
that tool is, and it stays out. The [overview](src/overview.md) states what
else is deliberately left outside, and why.

Every concept file carries a section tag matching its directory, because
`axm knowledge concepts query` can scope a search to a bundle but not to a
folder. The tags are `pe-foundations`, `pe-strategy`, `pe-problem`, `pe-solution`,
`pe-engineering`, `pe-delivery`, `pe-operations`, and `pe-maintenance`. Reserved
`index.md` and `log.md` files carry none, and neither do concepts at the bundle root, such as
the [overview](src/overview.md), which belong to no section.

## Boundaries

Four neighboring disciplines stay in their own bundles.

| Outside | Bundle | Why |
| --- | --- | --- |
| Documentation craft | `docs` | Expressing knowledge for a reader is its own discipline, and it applies well beyond product engineering |
| Knowledge management | `knowledge-management` | It governs agent instructions, skills, and knowledge bundles, none of which are products |
| Field-note practice | `field-notes` | It is the concept layer of a mechanism this repository runs, coupled to a rule, a skill, and a pack |
| Agent engineering | `agent-engineering` | The design of goal-directed model-driven systems is its own discipline; this bundle owns the workflow that surrounds an agent step, not the model-directed choice inside it |

The second and third were once candidates for a seventh section, How to learn.
That section has been retired; the [overview](src/overview.md) records the
reasoning and shows where each clause of its question now lives.

## Status

Five of the seven lifecycle sections hold concepts. Much of the material arrived
from six standalone bundles that have been retired into this one; newer
explanations introduce maintenance and shared foundations. Depth varies by where
the material came from. Some of it has since been retired again: a migrated concept that only summarized a public source, or
only restated a sibling, was removed rather than kept for volume. The
[update log](src/log.md) names every retired file and where its surviving claim
went.

| Section | Source | State |
| --- | --- | --- |
| Foundations | `product-management`; primary DDD sources | Jobs to Be Done, moved from What to solve; a new domain-driven design explanation |
| Where to play | `strategy`, `product-management` | Both bundles retired, and the migrated concepts have since been retired too, leaving scope, boundaries, and the value stick |
| What to solve | `product-management` | Migrated; that bundle retired. Two concepts; Jobs to Be Done now lives in Foundations |
| What to build | `requirements-engineering`, `product-management` | Requirements migrated and that bundle retired; the design half is unwritten |
| How to build it | `software-engineering` | Migrated and that bundle retired; two of five areas are unwritten |
| How to ship it | `work-management`, `workflow-automation` | Both migrated and retired; the `workflow-automation` concepts have since been retired, so only work items remain and flow, build and release, and delivery automation are unwritten |
| How to run it | None | No concepts; scope and boundaries only |
| How to maintain it | Care and maintenance scholarship, software literature, and practitioner accounts | A new introductory explanation; detailed maintenance guides are unwritten |

Three sections carry more than one source. In "Where to play" the question no
longer arises, because neither source left a concept behind. The other two
resolved it differently. In "What to build", the requirements concepts sit in a
[Requirements](src/solution/requirements/) subtree, keeping the section's own
top level for the design concepts still to be written. In "How to ship it",
[work items](src/delivery/work-items/) kept its own subtree because it is a
record contract rather than a field of systems; the field of systems that
arrived beside it has since been retired.

### What is still unsourced

No bundle supplies any of the following today, and none of it is written.
Delivery automation is on the list because the bundle that supplied it was
absorbed and its concepts then retired, not because the area was never
attempted.

| Unsourced area | Section |
| --- | --- |
| Architecture and technical design | How to build it |
| Construction | How to build it |
| Delivery flow: batch size, branching, review gates, and cadence | How to ship it |
| Build and release: versioning and artifact identity, environment topology, and rollout strategy | How to ship it |
| Delivery automation: workflow definition and execution, pipelines, quality gates, artifact promotion, and the continuous practices | How to ship it |
| Everything: observability, reliability, incident practice, operational security, and sustainment | How to run it |

Two more gaps of the same kind sit outside that table. The design half of
"What to build" — solution concept, resolution and fidelity, interaction
design, and constraint as design input — has no existing bundle behind it and
will be written from scratch. "Where to play" holds the value stick, its
non-responsibilities, and links to the public canon, and nothing more.

A section with no concepts still states its question, its scope, and its
boundaries. That is enough to place a concept and to keep neighboring sections
from claiming the gap, and it is not a claim that the guidance exists.

The knowledge package is licensed under CC-BY-SA-4.0.
