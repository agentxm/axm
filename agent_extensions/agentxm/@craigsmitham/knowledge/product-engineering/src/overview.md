---
type: Explanation
title: Product engineering overview
description: How the seven lifecycle sections express an opinionated product-development practice, how Foundations supplies shared conceptual context, where concepts belong, and what stays outside the bundle.
tags: [product-engineering, body-of-knowledge, information-architecture, organizing-scheme, design, explanation]
status: draft
generated:
  by: codex/gpt-6
  at: 2026-09-09T01:56:21Z
sources:
  - id: anthropic-agents
    resource: https://www.anthropic.com/engineering/building-effective-agents
    title: Anthropic — Building effective agents
  - id: openai-guide
    resource: https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/
    title: OpenAI — A practical guide to building agents
---

# Product engineering overview

This bundle collects the portable craft of building software products. Its seven
lifecycle sections express an opinionated development practice, from strategy
through operations and maintenance. Each section is named for the question a
practitioner is facing. [Foundations](foundations/) supplies the shared concepts that help
readers understand and apply that practice across the lifecycle.

## The seven lifecycle sections

| Question | Section | What it owns |
| --- | --- | --- |
| Where should we participate, and how do we win there? | Where to play | The organization-level choice of arena |
| Which problems are worth solving, and what outcome would tell us we succeeded? | What to solve | The problem, the outcome, and the evidence that the outcome occurred |
| Which solution concept do we commit to, and how do we state that commitment so others can dispute it? | What to build | The search across candidate forms and the commitment that ends it, stated so it can be disputed |
| How do we construct and verify what we committed to? | How to build it | Technical design, construction, and evidence of behavior |
| How does a change reach production safely and predictably? | How to ship it | The movement of change toward release |
| How does the product stay healthy, secure, and affordable in production? | How to run it | Production reality, including incident response and what an incident teaches |
| What does caring for an existing product involve as its circumstances change? | How to maintain it | Care, understanding, intervention, and responsibility for existing products |

The order is a value stream, but retrieval does not depend on it. Each section
index stands alone for a reader who arrives through search, and each names the
neighbor that owns the adjacent concern.

[How to maintain it](maintenance/) applies throughout a product's working life;
its position in this map is not a final handoff. It owns the reasoning specific
to evolving existing software. Technical construction and verification remain
in How to build it, release in How to ship it, and production health and live
decommissioning in How to run it. The
[maintenance introduction](maintenance/maintenance-and-the-life-of-software-products.md#reading-further-and-connections-within-product-engineering)
explains the boundary.

Sections are not equally developed. The map in [the discovery
index](index.md) says which ones hold concepts today and which hold only their
question, scope, and boundaries.

## Lifecycle and shared foundations

The seven sections organize the decisions, practices, and evidence of this
product-development lifecycle. Their question-shaped names make those decisions
easy to find. The lifecycle is iterative: production evidence can reopen the
problem, and engineering discoveries can change the solution. Its order does
not require sequential approval gates or completed handoffs.

Foundations is a companion collection for shared conceptual context. A reader
can enter through a lifecycle question or through a concept they need to
understand. Foundations is not an additional lifecycle stage or a prerequisite
reading sequence.

Use this placement rule:

- Put a shared explanation in Foundations when it informs several lifecycle
  decisions and is useful to understand independently of any one section.
- Put guidance for a particular lifecycle decision in the section that owns
  that decision, and link to the shared explanation.
- Keep an explanation with its lifecycle section when its scope is local to
  that section. A concept does not move merely because another section cites it.

[Jobs to Be Done](foundations/jobs-to-be-done.md) is the first shared foundation.
Its explanation supplies vocabulary for problem framing, solution comparison,
and outcome evaluation. Guidance on how to make each decision belongs with
that decision's lifecycle section.

Explaining an approach does not prescribe adopting it in full. A foundation
should state where it informs this practice, which elements are adopted, and
which remain optional or contextual. Concepts earn a place by supporting the
development approach; Foundations is not a general encyclopedia of methods.

Every explanation has one canonical home. Indexes and links expose it from
other sections without copying its definition. Quality outcomes, artifacts,
and knowledge forms remain useful discovery facets rather than competing
lifecycle partitions.

## How to learn, tried and retired

An earlier shape had a seventh section, How to learn: how do we notice what
happened, keep what we learned, and retire what is stale? It has been retired,
and the reasoning is recorded here because knowing why a section was set aside
is as useful as knowing why the others were kept.

The section never found content it could own. Of its four planned areas, two
restated the separate `knowledge-management` bundle, one restated the separate
`field-notes` bundle, and the fourth was never written at all. Nothing was left
in the middle. The only candidate identity that was genuinely product
engineering, learning from what shipped, already had an owner: [Outcomes and
evidence](problem/outcomes-and-evidence.md) covers whether the expected outcome
occurred, and names production use as one link in that evidence chain.

Neither neighboring bundle should move in. Knowledge management stays outside on
exactly the argument this overview already accepts for documentation craft: it
governs agent instructions, skills, and knowledge bundles, none of which are
products, so its audience is wider than product engineering. Field-note practice
stays outside because it is the concept layer of a mechanism this repository
runs, coupled to a rule, a skill, and a pack, rather than portable craft that
travels on its own.

Every clause of the retired question now has an owner.

| Clause | Owner |
| --- | --- |
| Learning from production, including what an incident taught | [How to run it](operations/), as post-incident review |
| Learning whether the expected outcome occurred | [What to solve](problem/) |
| Noticing friction in how work actually goes | The `field-notes` bundle |
| Keeping a claim trustworthy and retiring it when stale | The `knowledge-management` bundle |

The retired section had no distinct body of product-engineering craft left to
own. Foundations serves a different reader need: it holds shared explanations
within this bundle, with links from the lifecycle decisions they inform.

## Facets, not folders

Some distinctions can apply to several concepts and locations at once. Use
concept metadata and index prose to expose them across the lifecycle and
Foundations:

- the quality outcome a practice serves;
- the artifact it touches;
- its knowledge form, such as principle, pattern, practice, or reference; and
- whether it is portable craft or a technology binding.

These facets do not determine canonical placement. A concept can serve several
quality outcomes or touch several artifacts while retaining one home.

## Depth: sections ask, subtrees hold

Lifecycle sections are named for questions. Within a section, a subtree may be
named for the artifact whose craft it holds, as
[Requirements](solution/requirements/) and [Work items](delivery/work-items/) are.

That is not artifact type readmitted as an organizing scheme. Artifact type
fails as a partition because a reader arriving at the top of the corpus would
have to guess which artifact their question is about, and because practices that
span artifacts would have no home. A reader who has reached a section has already
chosen the question, and at that depth the artifact is the thing they came for.
The rule is a rule about depth: the question names the section, the artifact may
name the subtree, and no artifact ever names a section.

Two conditions keep the depth rule from becoming a loophole. A subtree earns an
artifact name only where it holds that artifact's craft in enough depth that a
reader wants to land in it directly rather than through the section. And a
concept that spans artifacts stays at the section's top level, because copying
it into each subtree is exactly the failure the facet rule above forbids.

A subtree may equally be named for the body of craft it holds rather than for an
artifact, as [Codebase review](engineering/codebase-review/) is. What a subtree
may never be named for is knowledge form. Form is a facet of every concept
rather than a body of craft, so naming a folder for it would force a concept
that is both a pattern and a practice to exist twice. Where a subtree wants to
group its concepts as patterns, practices, or principles, it does so with
headings in its index and tags on its concepts, the same mechanism
[Work items](delivery/work-items/) uses to group its roles.

Foundations groups shared concepts by subject. Start with individual concept
files; add a subject subtree when its depth warrants a separate browsing route.
Document form remains metadata, as it does in the lifecycle sections.

The same rule governs a subtree's own children. [Requirements](solution/requirements/)
divides into folders named for the activity a reader is engaged in — foundations,
development, authoring, review, lifecycle, adaptation — and
[Work items](delivery/work-items/) into folders named for the role a record
plays. Neither divides by form, and form varies freely inside both:
[Authoring](solution/requirements/authoring/) holds five guides, two references,
and a template, and [Defect Reports](delivery/work-items/defects/) holds an
explanation, three guides, and a reference.

The test is what the folder is named for, not what it happens to contain. A
subtree may turn out uniform in form without being partitioned by it, because
that craft happens to be expressed one way rather than because form drew the
boundary. Uniformity is therefore not the signal. The signal that form has
become the partition is a sibling folder that holds the same subject in a
different form.

The same reasoning runs the other way for section membership, which is a folder
already. Retrieval does not see folders: `axm knowledge concepts query` filters
by bundle and by tag, and bundle is the only scope filter it offers. Without
help, a query cannot ask for the requirements material without also pulling the
codebase-review material. So section membership is carried as a facet too. Every
concept file gets one section tag appended to its existing tags, matching the
directory it sits in.

| Directory | Section tag |
| --- | --- |
| `src/foundations/` | `pe-foundations` |
| `src/strategy/` | `pe-strategy` |
| `src/problem/` | `pe-problem` |
| `src/solution/` | `pe-solution` |
| `src/engineering/` | `pe-engineering` |
| `src/delivery/` | `pe-delivery` |
| `src/operations/` | `pe-operations` |
| `src/maintenance/` | `pe-maintenance` |

Two kinds of file carry no section tag. Reserved `index.md` and `log.md` files
carry none because they are navigation and history rather than a section's
retrievable claims. Concepts at the bundle root carry none because they belong
to no section: this overview is one, and a query that wants it is asking about
the bundle rather than about a question. Every other concept file carries
exactly one. The tag records canonical placement, not every place the concept
applies; Foundations concepts carry `pe-foundations` even when several lifecycle
sections use them. The tag is derived from the path and adds no meaning of its own;
when a concept moves between sections, its tag moves with it. Treat a section
tag that disagrees with the directory as a defect in the file, not as a second
opinion about where the concept belongs.

An index carries claims all the same, and after the 2026-09-08 retirement some
of them are stated nowhere else. Where a section was reduced to scope and
boundaries, the few claims worth keeping stayed in its index: the value stick in
[Where to play](strategy/), the four product risks in [What to solve](problem/),
and the two owners of incident thresholds and severity in [Operational Incident
Records](delivery/work-items/incidents/). Those claims are authoritative and
untagged, so a tag-scoped query will not return them, and a reader who reaches
the bundle only through `axm knowledge concepts query` will not see them. That
is the accepted cost of not writing a concept to house one paragraph, and it is
bounded by one rule: an index may state a claim of its own, including what a
subtree's records must show, but never one a tagged concept has to cite as its
authority. A claim a concept must lean on is promoted into a tagged concept of
its own, so that nothing retrievable rests on something unretrievable.

## Where design fits

Design is choosing the form a solution will take, at a deliberate resolution,
from alternatives that were genuinely considered. A statement becomes design
the moment it constrains form; until then it describes a problem. That test is
what separates What to solve from What to build.

This passage is the definition of record. A section that needs it cites this
one rather than repeating it, on the requirement principle [One authority, many
witnesses](solution/requirements/foundations/one-authority-many-witnesses.md):
a second copy of a definition becomes a second authority the moment one of the
two is edited, and the bundle would then hold two accounts of design without
anyone having decided to change it.

Design is not a section, because it is an activity that recurs at several
altitudes. Sections own altitudes; no section owns the word.

| Altitude | Question answered | Owning section |
| --- | --- | --- |
| Solution concept | Which shape of solution do we commit to, and what will we not do? | What to build |
| Interaction | What does a person encounter, and how do they operate it? | What to build |
| Technical | How is the system structured so it can be built and changed? | How to build it |
| Operational | How is the running system arranged so it can be observed and recovered? | How to run it |

Naming the altitudes is what lets two sections do design work without
colliding, and it is why the sections are named for questions rather than for
the activity.

A requirement is not a rival to design. It is the form a design choice takes
once it must survive being disputed, traced through change, and bound to
verification, which is why What to build owns both. Requirements are chosen
rather than discovered, and the choosing is design work.

Naming What to build and How to build it as a pair does not make them a
handoff. What crosses that boundary is a commitment, not a finished
specification, and technical design regularly sends it back.

## What stays outside

Five things are deliberately not here. Each is real craft; none of it is owned
by a product-engineering question.

| Outside | Why |
| --- | --- |
| Technology bindings | A language, framework, or vendor specific ages on a different clock than the practice does, so it lives in its own bundle and is referenced rather than restated |
| Documentation craft | Expressing knowledge for a reader is a discipline in its own right, with an audience wider than product engineering |
| Knowledge management | It governs agent instructions, skills, and knowledge bundles, none of which are products, so its audience is wider too |
| Field-note practice | It is the concept layer of a mechanism this repository runs, coupled to a rule, a skill, and a pack, rather than portable craft that travels alone |
| Agent engineering | The design of goal-directed model-driven systems is its own discipline, owned by the separate `agent-engineering` bundle; this bundle owns the workflow that surrounds an agent step, not the model-directed choice inside it |

The first row rules out technology bindings, and the rule is narrower than it
reads. A binding is guidance that only works on one platform: how to configure
this runner, which flag this framework wants, what this vendor calls its own
feature. It ages with the product, it is useless to a reader on a different
platform, and it stays out. Naming a platform is not what makes a binding.
Citing a tool's documentation as evidence for a portable claim, as the execution
surface concepts do, is evidence; teaching a reader to operate that tool is a
binding.

The last row is the youngest and the least obvious, so it is stated here rather
than left to the table. Classify a system by who controls its meaningful next
steps — not by whether it uses a model, a tool, a graph, or a product that calls
itself an agent.[^anthropic-agents]

| Form | Control path | What agent engineering owns |
| --- | --- | --- |
| Deterministic automation | Code or rules choose every step | Nothing |
| LLM workflow | A predefined graph invokes models at known steps | Only local model behavior, where a step has bounded dynamic choice |
| Agent | A model-directed loop chooses meaningful next steps | Goal, planning, capability choice, recovery, delegation, and stopping |
| Agentic workflow | A durable workflow surrounds one or more bounded agent steps | The dynamic decisions inside each agent step and between delegated actors |

The first two rows are workflow automation, which [How to ship it](delivery/)
claims as scope and has not yet written. The last two are the discipline this
bundle does not own: the surrounding trigger, dependencies, durable progress,
approvals, retries, cancellation, and compensation would belong here, and the
model-directed choice inside the agent step never does.[^openai-guide]

Because knowledge bundles cannot declare dependencies on one another, a concept
here must be readable by someone who installed only this bundle. Where a section
borrows a term another bundle owns, it gives the term a short working definition
and names the owner, rather than relying on a link that may not resolve. A
section that cannot be read without another bundle installed is a sign that a
concept has been placed in the wrong section.

[^anthropic-agents]: Anthropic — Building effective agents, which separates
    workflows whose steps are orchestrated through predefined code paths from
    agents that direct their own process and tool use.
[^openai-guide]: OpenAI — A practical guide to building agents, on what an
    agent independently decides and where a surrounding system keeps control.
