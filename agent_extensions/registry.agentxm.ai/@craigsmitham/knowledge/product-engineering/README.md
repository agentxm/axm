# Product engineering knowledge

A portable body of knowledge for building software products. Seven lifecycle
sections express an opinionated development practice, from strategy through
operations and maintenance. Foundations supplies the shared concepts that inform
that practice.

Start at the [discovery map](src/index.md). For a path across subjects, use
[Reading product engineering](src/reading-product-engineering.md): four optional
routes connect value, strategy, behavior, and change to practical guidance.
Open [Foundations](src/foundations/) to choose among explanations of value,
strategy, design, behavior, project commitments, measures, and maintenance.
Its question-led catalog includes both the individual approaches and their
comparisons. You can also enter through a lifecycle question below.

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

The [Northbank Equipment case](src/northbank-equipment.md) connects business
context to domain behavior, code, tooling, CI/CD, infrastructure, and care.
Its related worked examples cover commitment requirements, allocation change,
engineering-system change, and receipt incident records. Their scopes and
numerical exhibits remain explicit; they do not prescribe one combined method.

## Maintaining discovery

Keep each concept in one canonical location. The root and section indexes
route readers; the [reading guide](src/reading-product-engineering.md) owns
optional learning sequences; individual concepts own their explanations and
practical guidance. The [strategy comparison](src/foundations/strategy-perspectives.md)
and [maintenance comparison](src/foundations/maintenance-strategies.md) own the
substantive relationships within their respective groups. Preserve their
attributed differences when updating either side of a comparison.

For a new or changed concept:

- Give its index entry the canonical title and description. Place the entry
  under the reader question it helps answer, and make the search preview useful
  without directory context.
- Add a contextual link where another concept supplies background, resolves a
  likely confusion, explains application, or opens a useful further question.
  State what following the link adds; shared vocabulary alone is insufficient.
- Offer a few deliberate continuations when the reader has a meaningful choice
  after finishing. Add reverse links where the reverse journey is useful,
  without making reciprocity or a fixed number of links mandatory.
- Update an affected reading route when its sequence or promises change. Keep
  substantive comparisons in their concept document, and link from indexes
  with short selection cues. Source citations establish provenance; use reader
  links as well when the destination is needed for understanding.
- Walk from the root to the concept and from the concept to a useful next
  reading. Check local links and fragments, exact previews, and bundle
  validation. A route to a scope-only section must say that practical guidance
  is unwritten. Evaluate comprehension by the questions a route resolves, not
  by the number of links added.

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
| Foundations | `product-management`; Oberholzer-Gee's interviews and HBS value-strategy explanations; Lafley and Martin's strategy articles; Cagan's SVPG strategy articles; Singer's Shape Up; Cockburn's use-case and incremental-development books; primary DDD sources; Brooks's essays and design interview; Simon Wardley's book; Drucker's writings and Drucker Institute material; NASA and DOE maintenance guidance; Parnas and software-aging research | Shared conceptual explanations and comparisons; the [foundation catalog](src/foundations/) groups the current material by reader question |
| Where to play | `strategy`, `product-management` | Both bundles retired, and the migrated concepts have since been retired too; scope, boundaries, and routes to shared foundations remain |
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
design, and constraint as design input — has shared conceptual grounding in
Foundations, including Buxton and Shape Up; practical guidance remains
unwritten. "Where to play" holds its scope,
non-responsibilities, and routes to value-based strategy, Playing to Win, Cagan,
and Wardley mapping foundations and public strategy sources; decision guides
remain unwritten.

A section with no concepts still states its question, its scope, and its
boundaries. That is enough to place a concept and to keep neighboring sections
from claiming the gap, and it is not a claim that the guidance exists.

The knowledge package is licensed under CC-BY-SA-4.0.
