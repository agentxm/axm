---
type: Explainer
title: Explanation explainer
description: How explanation documentation builds understanding through conceptual structure, distinctions, judgment, examples, and evidence while keeping a bounded reader purpose.
tags: [docs, explanation, understanding, conceptual-structure, distinctions, judgment, examples, evidence, diataxis]
status: stable
sources:
  - id: diataxis-explanation
    resource: https://diataxis.fr/explanation/
    title: Diátaxis — Explanation
  - id: diataxis-explanation-src
    resource: https://github.com/evildmp/diataxis-documentation-framework/blob/main/source/explanation.rst
    title: Diátaxis source — explanation.rst
  - id: diataxis-start
    resource: https://diataxis.fr/start-here/
    title: Diátaxis — Start here
  - id: diataxis-start-src
    resource: https://github.com/evildmp/diataxis-documentation-framework/blob/main/source/start-here.rst
    title: Diátaxis source — start-here.rst
  - id: diataxis-ref-explanation
    resource: https://diataxis.fr/reference-explanation/
    title: Diátaxis — Reference vs explanation
  - id: diataxis-ref-explanation-src
    resource: https://github.com/evildmp/diataxis-documentation-framework/blob/main/source/reference-explanation.rst
    title: Diátaxis source — reference-explanation.rst
  - id: johnson-diataxis
    resource: https://idratherbewriting.com/blog/what-is-diataxis-documentation-framework
    title: Tom Johnson — What is Diátaxis (explanation pattern notes)
  - id: mintlify-content-types
    resource: https://www.mintlify.com/guides/content-types
    title: Mintlify — Content types (explanation notes)
  - id: ddd-authoring
    resource: Repository authoring and review of Domain-driven design in the product-engineering knowledge bundle on 2026-09-08
    title: Domain-driven design — repository authoring case
  - id: jtbd-authoring
    resource: Repository authoring and review of Jobs to Be Done in the product-engineering knowledge bundle on 2026-09-08
    title: Jobs to Be Done — repository authoring case
generated:
  by: codex/gpt-6
  at: 2026-09-09T02:13:49Z
---

# Explanation explainer

An **explanation** is a discursive treatment of a topic that invites
**reflection**. It is **understanding-oriented**: it deepens and broadens
what the reader grasps, joins things into a bigger picture, and answers
questions like *why?* and *Can you tell me about …?*[^diataxis-explanation]

Its success is visible in what the reader can now explain: how concepts fit
together, why a distinction matters, and which circumstances change a judgment.
This page examines what makes that understanding possible and how explanation
keeps its purpose distinct from instruction and lookup.

It is documentation one can usefully read **away from the product** — material
for study and thought rather than for hands on the console. Of the four
Diátaxis reader-need forms, it is the only one that might make sense to read “in the
bath.”

Harold McGee’s *On Food and Cooking* is a strong everyday model: no recipes to
execute mid-kitchen, no ingredient tables to look up — the history, science,
and culture around cooking, so that practice becomes calmer and better
grounded.

Other names hosts use for the same job: *Discussion*, *Background*,
*Conceptual guides*, *Topics*.

To write one, use [Explanation guide](../guides/explanation.md).

## Place on the map

In Diátaxis, explanation sits with **cognition** (what the user knows) and
**study** (acquisition of skill), not with action or with application at
work. These describe the reader need the document serves, rather than a ban
on discussing practical consequences:

| Axis | Explanation’s side | Contrast |
| --- | --- | --- |
| Action vs cognition | Cognition / propositional knowledge | Tutorials and how-tos direct action |
| Study vs work | Study (understanding for its own sake) | Reference also states facts, but for **work** — lookup while doing |

So explanation is less *urgent* than a broken how-to or missing reference, but
not less *important*: without it, knowledge of a craft stays loose and
anxious.

Its vantage is **higher and wider** than the other three forms. It is not the
user’s eye-level task view (how-to) or a close-up of the machinery
(reference). Its unit is a **topic** — a bounded area of knowledge — and it
may circle that topic from several directions.

The word *explain* shares roots with **unfolding** — bringing into the light
what was implicit. *Understanding* shares roots with **grasp** — holding the
craft so practice is less fragile.

## Orientation

| | |
| --- | --- |
| **Reader need** | Understanding / reflection |
| **Success** | The reader can explain relationships, distinguish neighboring concepts, and reason about relevant tradeoffs and limits |
| **Voice** | Discussion: may digress, compare, and weigh perspectives when that aids insight |
| **Typical prompt** | *Why is it this way?* · *Can you tell me about X?* · *How does this fit together?* |
| **Title cue** | Often reads as *About …* (explicit or implicit) |

## What belongs

- Context and background that illuminate the topic (history, constraints,
  design decisions, implications)
- Connections — to related ideas, and even outside the immediate product if
  that helps the web of understanding
- Multiple perspectives, alternatives, counter-examples, and **opinion** where
  judgment is part of understanding the craft
- Mental models, analogies, and “unfolding” of what is implicit in how the
  system behaves
- Clarification of concepts that tutorials, how-tos, and reference assume
- Diagrams or examples that serve insight (not step-by-step task completion)

Common rhetorical moves in strong explanations include definition, background,
relationships, implications, and further reading — always in service of
understanding, not procedure.

## How explanation builds understanding

Diátaxis supplies the foundation: context, connections, perspective, and bounded
discussion. The principles below are this bundle's practical elaboration,
developed through authoring explainers on domain-driven design (DDD) and Jobs
to Be Done (JTBD). Those cases illustrate the reasoning; they do not establish
a universally effective outline.
[^ddd-authoring][^jtbd-authoring]

### Make the conceptual structure visible

A reader needs to see the important concepts and how they relate. An outline
can express that structure before the details are read: foundational ideas
introduce the terms needed for later distinctions, and related concepts appear
together. Familiar subject vocabulary helps readers recognize where they are
and return to a particular question.

For example, grouping DDD's strategic and tactical concepts made its outline
more informative than a sequence of generic headings such as “Overview,”
“Benefits,” and “Best practices.” JTBD needed an early account of competing
meanings before a discussion of their methods could make sense.

The structure follows the understanding sought. A history may appropriately
follow people and events; a comparison may organize around alternatives.
A concept map helps an author choose an order, but the published document
still needs a readable progression. Neither a universal outline nor an
exhaustive glossary supplies that judgment.

### Teach distinctions that change interpretation

Definitions explain individual terms. Understanding also requires knowing what
those definitions separate and how the concepts interact. Consequential
distinctions deserve space where the reader encounters the ambiguity, rather
than being deferred to a glossary.

DDD's subdomain and bounded context both describe boundaries, but one concerns
subject matter and the other the scope of a model. Explaining that difference
reveals why their boundaries need not align. In JTBD, distinguishing a job from
a solution prevents a proposed feature from silently defining the research.
The explanation becomes useful when it shows what goes wrong if the concepts
are conflated, as well as where they overlap or relate.

Not every similar word warrants a comparison. The test is whether the confusion
would change the reader's interpretation, reasoning, or expectations.

### Explain the judgment behind classifications

A taxonomy names categories; an explanation makes their use intelligible.
Where the topic involves classification or framing, readers need the defining
criteria, relevant evidence, implications, and conditions that could change
the conclusion. Heuristics and uncertain judgments should retain their limits.

DDD's core/supporting/generic classification needed an account of strategic
differentiation, not just three definitions. Billing can play a generic role
when standard invoicing meets a business's needs and a core role when unusual
charging arrangements create its competitive advantage. JTBD job framing
similarly depends on whose objective is being examined and at what scope.

Criteria belong here when they explain why a judgment is warranted. A scoring
procedure to execute or a binding classification policy serves another reader
need. An explanation can make the reasoning accessible without pretending to
settle every future case.

### Use examples to develop reasoning

An example earns its space by doing explanatory work: exposing a relationship,
making an abstraction concrete, or showing how changed circumstances produce
a different conclusion. Repeating terminology inside a story is insufficient.

A running example can reduce the effort of repeatedly learning a new setting.
The JTBD incident scenario connects a manager's reasons for changing an
arrangement with responders' objectives, research questions, and possible
solutions. Each return to the scenario adds a relationship. Contrasting cases
are more useful when the point is variation, as with billing's different
strategic roles.

Examples also have boundaries. A single case can make one implementation look
inevitable or conceal perspectives it does not represent. State consequential
assumptions, label invented examples as illustrative, and introduce a contrast
when it reveals a limit. A diagram should clarify a relationship that prose
leaves difficult to grasp; it need not appear merely to decorate the page.

### Preserve differences between perspectives

An explanation can weigh competing views while representing each fairly.
Shared vocabulary does not establish shared meaning. Describe an approach in
its own terms, attribute criticisms to their authors, and distinguish agreement
from the explanation's synthesis.

JTBD's progress and functional interpretations show the risk: explaining one
solely through its critic's description distorts the comparison. Combining
their findings also requires explaining which questions and evidence connect
them. A smooth narrative can otherwise conceal an unsupported inference.

Sources support particular claims. A method owner's account establishes what
they advocate; their promotional claims do not independently establish its
effectiveness. A documented case, an illustrative scenario, and a general
conclusion provide different support. Explicit attribution allows readers to
assess those differences without requiring a neutral stance on every question.

### Connect concepts to consequences and limits

Readers understand a concept more deeply when they can see what follows from
it and what remains undecided. A bounded context does not determine a deployment
unit. An unmet customer outcome does not select a feature. These connections
help readers carry knowledge into practice without giving the concept authority
over a decision it cannot settle.

Applicability, costs, alternatives, and complementary approaches belong in the
discussion when they explain the concept's reach. They qualify the claim at
the point where readers might overextend it. A separate implementation guide
can then direct the concrete work.

### Make understanding assessable

“The reader understands the topic” is too vague to guide an author or reviewer.
A more useful aim identifies what the reader should be able to distinguish,
explain, or reason about. For a classification, can they explain why a changed
circumstance could change the category? For a research method, can they identify
what its evidence leaves unresolved?

These aims guide depth and scope. A missing prerequisite or a difficult
distinction may deserve expansion; another catalog of terms may add little.
The document can demonstrate the intended reasoning with a contrasting case
without becoming a lesson or attaching a mandatory quiz. Actual reader
comprehension requires reader evidence; an author's review establishes only
that the explanation provides the necessary support.

## What does not belong

- A beginner’s end-to-end **lesson** (tutorial) — put minimal “why” in the
  lesson and link here for depth
- The only copy of an operational **procedure** (how-to)
- The authoritative exhaustive **inventory** of interfaces (reference)
- Instruction or technical description absorbed “while covering the topic” —
  explanation tends to swallow other forms if unbounded
- A topic with no spine — open-ended “everything about X” without a real or
  imagined *why* (or similar prompt) to bound the page

## Quality signals

- A central understanding question is obvious near the top
- The piece could be read away from the product without feeling incomplete as
  *discussion* (even if it links out for doing and lookup)
- Headings reveal a meaningful conceptual structure and reading order
- Important distinctions include their relationships and consequences
- Classifications and framing choices expose criteria, evidence, and limits
- Examples develop reasoning; changed circumstances can change the conclusion
- Opinions and alternatives are visible and distinguishable from hard system
  facts
- Scope is deliberately bounded; related action and facts live in how-tos and
  reference and are linked, not duplicated
- Claims distinguish source accounts, documented evidence, illustrative cases,
  and the author's synthesis
- Each intended reader outcome has support in the body; terminology coverage
  alone is insufficient

When form is ambiguous, examine the primary need: understanding reasons and
relationships, executing a task, or looking up a fact. A practitioner can pause
during work to seek explanation. The occasion of reading does not change the
document's purpose.

## Language that fits explanation

Useful shapes (paraphrased from Diátaxis):

- *The reason for x is historically y …*
- *W is better than z here because …*
- *An x in this system is analogous to a w in that system; however …*
- *Some users prefer w (because z). That can work, but …*
- *An x interacts with a y as follows …* (unfolding internals for insight)

## Explanation vs reference (the hard boundary)

Both live in the theory half of the map. The difference is **study vs
work**:

| | Explanation | Reference |
| --- | --- | --- |
| User mode | Study — acquire understanding | Work — apply skill |
| Purpose | Illuminate a topic for reflection | Describe the machinery for lookup |
| Form | Develops reasoning through prose, examples, comparisons, or diagrams | Supports accurate retrieval through consistent descriptions and organization |
| Structure | Follows conceptual relationships and the reader's understanding question | Follows the subject being described for lookup |
| Opinion | Allowed and often needed | Out of place |
| Prompt | *Can you tell me about…?* away from the console | *What is…?* while hands-on |

Diátaxis distinguishes the forms by the study or work need they serve and warns
that expansive explanation can interrupt reference.[^diataxis-ref-explanation]
This bundle treats surface form as a clue rather than a deciding test. A table
comparing boundary meanings can develop understanding; a table of parameter
defaults serves lookup. Classify by the contribution to the reader's purpose,
not by counting tables, lists, or paragraphs.

Similarly, explaining the criteria behind a choice does not make the page a
how-to. Directing the reader through the steps needed to make that choice in a
specific situation would change its primary job.

## Failure modes (common)

- **Scattered explanation** — tiny *why* parcels only inside tutorials and
  how-tos, with no place to go for reflection
- **Tutorial overload** — lessons stuffed with theory the learner cannot use
  yet
- **Absorbed runbook or reference** — the “overview” is actually the missing
  how-to or API catalog
- **Unscoped essay** — no bounding question; the topic never lands
- **Neutral-only false discipline** — stripping all perspective so real
  craft tradeoffs stay invisible
- **Concept inventory without relationships** — terms are covered but their
  dependencies, boundaries, and implications remain unclear
- **Classification without judgment** — category names substitute for criteria
  and the evidence needed to distinguish them
- **Decorative examples** — scenarios repeat labels without developing reasoning
- **False synthesis** — shared wording conceals incompatible meanings or claims
- **Evidence inflation** — an illustration or advocate's assertion becomes a
  general conclusion without additional support
- **Surface-form policing** — useful comparisons or criteria are removed merely
  because they use tables or concern practical decisions
- **Template imitation** — a previous explainer's length, outline, or example
  count becomes a requirement for a different subject

## Related

- [Explanation guide](../guides/explanation.md)
- [Documentation craft](documentation-craft.md)
- [Tutorial explainer](tutorial.md)
- [How-to explainer](how-to.md)
- [Reference explainer](reference.md)

[^diataxis-explanation]: Diátaxis, [Explanation](https://diataxis.fr/explanation/).
[^diataxis-ref-explanation]: Diátaxis, [The difference between reference and explanation](https://diataxis.fr/reference-explanation/).
[^ddd-authoring]: Repository authoring case: Domain-driven design, especially classification criteria and subdomain/context distinctions. The case illustrates the craft synthesis; it is not an evaluation of reader comprehension.
[^jtbd-authoring]: Repository authoring case: Jobs to Be Done, especially job framing, competing interpretations, and the running incident scenario. The case illustrates the craft synthesis; it is not an evaluation of reader comprehension.
