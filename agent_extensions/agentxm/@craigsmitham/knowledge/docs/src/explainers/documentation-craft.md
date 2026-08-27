---
type: Explainer
title: Documentation craft
description: What effective documentation craft is — matching form to reader need, keeping each job recognizable, and respecting host conventions over portable layout rules.
tags: [docs, craft, quality, diataxis, explainer]
status: stable
sources:
  - id: diataxis
    resource: https://diataxis.fr/
    title: Diátaxis documentation system
  - id: diataxis-start
    resource: https://diataxis.fr/start-here/
    title: Diátaxis — Start here
  - id: diataxis-start-src
    resource: https://github.com/evildmp/diataxis-documentation-framework/blob/main/source/start-here.rst
    title: Diátaxis source — start-here.rst
  - id: diataxis-map
    resource: https://diataxis.fr/map/
    title: Diátaxis — The map
  - id: diataxis-map-src
    resource: https://github.com/evildmp/diataxis-documentation-framework/blob/main/source/map.rst
    title: Diátaxis source — map.rst
  - id: diataxis-foundations
    resource: https://diataxis.fr/foundations/
    title: Diátaxis — Foundations
  - id: diataxis-foundations-src
    resource: https://github.com/evildmp/diataxis-documentation-framework/blob/main/source/foundations.rst
    title: Diátaxis source — foundations.rst
  - id: johnson-diataxis
    resource: https://idratherbewriting.com/blog/what-is-diataxis-documentation-framework
    title: Tom Johnson — What is Diátaxis
  - id: mintlify-content-types
    resource: https://www.mintlify.com/guides/content-types
    title: Mintlify — Content types
  - id: pattern-writing-language
    resource: https://www.hillside.net/index.php/a-pattern-language-for-pattern-writing
    title: Meszaros and Doble — A Pattern Language for Pattern Writing
  - id: fowler-writing-patterns
    resource: https://martinfowler.com/articles/writingPatterns.html
    title: Martin Fowler — Writing Software Patterns
generated:
  by: codex/gpt-5.6
  at: 2026-08-26T14:02:36Z
---

# Documentation craft

Portable **understanding** of documentation quality — not repository layout,
frontmatter schemas, or tooling. Host projects may add structure, metadata,
and validators; those local rules win when they exist.

On the question of **which reader need a document serves**, this bundle adopts
Diátaxis — tutorial, how-to guide, reference, and explanation. Each is
developed as an [explainer](index.md) (what the form is for) plus a paired
[guide](../guides/) (how to write one).

Diátaxis is foundational craft, not the directory scheme or an exhaustive
taxonomy for every artifact name. This bundle recognizes **explainers**,
**guides**, **principles**, and **patterns** as distinct forms of reusable
guidance. Those forms answer a different question: how should this knowledge
help its reader?

For how to apply this craft in practice, see
[Documentation craft guide](../guides/documentation-craft.md). For iterative remediation of an
existing corpus, see [Documentation workflow](documentation-workflow.md). For
functional vs deep quality, see [Documentation quality](documentation-quality.md).
For choosing a physical organization and names without turning either into a
universal taxonomy, see [Documentation organization and
discovery](documentation-organization-and-discovery.md).

## Why four reader needs

Documentation must serve the [**practitioner in a practice**](practice.md) — someone who both
**acquires** and **applies** skill, and who needs both **action** (knowing
*how*) and **cognition** (knowing *that*). Those two dimensions define four
quarters, and Diátaxis holds that the map they produce is complete: those four
categories cover all the territory defined by the two axes. Diátaxis calls
them documentation types; this bundle calls them **reader-need forms** to keep
that classification distinct from the form of the guidance itself.

Take that claim at its own scope. It is an argument about the **map of reader
needs** — no fifth quarter exists on those two axes. It is not a claim that
documentation has no other concerns, and it does not bear on the questions
Diátaxis leaves alone: what artifacts get named, how a corpus is published and
reviewed, or how documentation is kept current. Adding concepts on those
questions extends the bundle without contradicting the map.

| Need | Form | User mode | Documentation informs |
| --- | --- | --- | --- |
| Learning | Tutorial | Study + action | Skill acquisition through doing |
| Goals | How-to | Work + action | Task completion in the real world |
| Information | Reference | Work + cognition | Facts for lookup while working |
| Understanding | Explanation | Study + cognition | Context and reflection |

Crossing or blurring those boundaries is at the root of many documentation
failures: wrong voice, wrong structure, and content that cannot meet either
job well.

## Choose a form by need

| Need | Form | Explainer | Guide |
| --- | --- | --- | --- |
| Learn by doing, first success path | Tutorial | [Tutorial explainer](tutorial.md) | [Tutorial guide](../guides/tutorial.md) |
| Achieve a concrete goal in a real system | How-to | [How-to explainer](how-to.md) | [How-to guide](../guides/how-to.md) |
| Look up facts, interfaces, or terms | Reference | [Reference explainer](reference.md) | [Reference guide](../guides/reference.md) |
| Understand why, context, or tradeoffs | Explanation | [Explanation explainer](explanation.md) | [Explanation guide](../guides/explanation.md) |

If a draft tries to do two of these at once, prefer splitting or making one
job primary and linking the rest.

Quick compass (content + user mode → reader-need form):

| If the content… | …and serves the user’s… | …then it belongs to… |
| --- | --- | --- |
| informs action | acquisition of skill | tutorial |
| informs action | application of skill | how-to guide |
| informs cognition | application of skill | reference |
| informs cognition | acquisition of skill | explanation |

## Form follows job

Diátaxis pairs each need with a characteristic form (paraphrased):

| | Tutorial | How-to | Reference | Explanation |
| --- | --- | --- | --- | --- |
| Does | introduce, educate, lead | guide | state, describe, inform | explain, clarify, discuss |
| Answers | *Can you teach me to…?* | *How do I…?* | *What is…?* | *Why…?* / *About…* |
| Oriented to | learning | goals | information | understanding |
| Form | a lesson | a series of steps | dry description | discursive discussion |
| Everyday analogy | teaching a child to cook | a recipe | label on a food packet | culinary social history |

Secondary writeups treat these as **information patterns** authors can keep
distinct so readers get the voice and structure they need.

## Cycle of interaction

Users do not always walk the map in order, but craft mastery often moves
through phases:

1. **Learning** — dive in under guidance (tutorial)
2. **Goals** — put skill to work (how-to)
3. **Information** — consult facts the head does not hold (reference)
4. **Understanding** — reflect away from the work (explanation)

Then back again for a deeper layer or a new skill. Documentation should
support that cycle without forcing a single linear site tour.

## Quality principles

Practical checks for authors. The two-layer model (functional vs deep quality)
is in [Documentation quality](documentation-quality.md).

1. **One primary reader job per ordinary document.** When a maintained pattern
   calls for several coordinated parts, keep each job recognizable so readers
   know whether they are learning, doing, looking up, or understanding.
2. **Match form to job.** Steps belong in tutorials and how-tos; exhaustive
   inventories in reference; discussion and rationale in explanation.
3. **Link rather than restate.** When another document owns a procedure or
   fact set, point to it; do not maintain a second full copy.
4. **Prefer clarity of outcome.** State what the document is for near the
   top so people and tools can skip the wrong page quickly.
5. **Make action documents selectable before opening.** In a description or
   other context-free preview, pair the supported outcome with the observable
   situation, event, symptom, or reader intent that makes the document
   relevant. Use a literal event only when work is event-driven; a
   voluntarily selected guide normally states reader intent. Keep selection
   conditions distinct from the access, knowledge, or state preconditions
   required after selection.
6. **Stay accurate enough for the job.** How-tos and reference go stale
   fastest; refresh or retire when commands, APIs, or ownership change.
7. **Respect the host.** Paths, indexes, metadata fields, and naming are
   project choices. Portable craft does not mandate a folder tree or a
   single frontmatter profile.
8. **Resist feature-shaped IA as the only scheme.** Organizing only by
   product surface, without reader-need forms, produces wild inconsistency
   across a portfolio.

## Neighbour bleed (where reader-need forms collapse)

Each form has affinity with its neighbours; blur is common:

| Shared quality | Neighbours that bleed |
| --- | --- |
| Guide action | tutorial ↔ how-to |
| Serve application of skill | reference ↔ how-to |
| Propositional knowledge | reference ↔ explanation |
| Serve acquisition of skill | tutorial ↔ explanation |

Worst case: tutorials and how-tos fully collapse, so neither study nor work
is served. Keep the compass and the hard-boundary sections on
each explainer when form starts to slip.

## Explainers, guides, principles, and patterns

The four Diátaxis forms classify the **reader job of the documentation being
created**. This bundle distinguishes four forms of **reusable guidance**:

| Guidance form | Reader asks | Characteristic content |
| --- | --- | --- |
| Explainer | *What is this, why does it matter, and where are its boundaries?* | Concepts, context, relationships, and distinctions |
| Guide | *How do I create, revise, or maintain it?* | Goal-oriented authoring or remediation process |
| Principle | *What durable direction should guide this class of decisions, and why?* | Recognized good, normative direction, warrant, scope, tensions, judgment cases, and enactments |
| Pattern | *This recurring problem is present — what established solution fits, and what will it cost?* | Context, forces, generative solution, consequences, evidence, and relationships |

An explainer and guide often form a useful pair: understanding stays separate
from action while each links directly to the other. Not every subject needs
both. A principle is warranted when a sourced, action-directing claim gives
durable orientation to judgment in service of a recognized good. A pattern is
warranted only when recurrence and evidence support a conditional reusable
solution. Neither is a decorated guide or a synonym for best practice.

A [practice](practice.md) is not a fifth reusable-guidance form. It is the
socially sustained, embodied, equipped, purposive, and normative reality in
which people acquire and apply skill. Documentation can articulate parts of a
practice and support participation without containing the whole practice or
replacing formation and judgment.

A [standard](standard.md) is likewise not another reader need or guidance form.
It establishes a recognized basis for judgment or coordination. A standards
document commonly uses reference-like presentation for its normative
provisions, while separate guides and explanations support implementation and
understanding.

Patterns may prescribe named artifacts. [Runbook](../patterns/runbook.md)
solves the problem of executing one established operational response safely;
[Playbook](../patterns/playbook.md) solves selection among several established
responses. The produced runbook or playbook is a realization of the pattern,
not a reason to maintain another competing taxonomy.

A principle or pattern is not another Diátaxis reader need. Each combines
reader jobs while making a different reusable claim. [Principle
explainer](principle.md) defines action-directing normative guidance, and
[Principle guide](../guides/principle.md) supplies its authoring workflow.
[Pattern explainer](pattern.md) defines the recurring problem-solution form;
[Pattern guide](../guides/pattern.md) supplies its distinctive mining and
authoring workflow; the [pattern library](../patterns/) contains actual
entries.

## What this bundle does not define

- Where files must live in a repository
- Required metadata keys or validators
- Always-on agent instruction files (harness / instruction guidance)
- Product marketing or user-facing site IA unless the host maps those
  surfaces onto these four reader-need forms

The bundle does offer portable criteria for choosing among host-compatible
organizations. It does not prescribe the resulting paths; see [Documentation
organization and discovery](documentation-organization-and-discovery.md).

Diátaxis itself is pragmatic: use what helps; you need not adopt every
theoretical layer to improve one page today. Prefer small iterative
improvements over empty form shells — see
[Documentation workflow](documentation-workflow.md).

## Related

- [Documentation craft guide](../guides/documentation-craft.md)
- [Documentation workflow](documentation-workflow.md) · [Documentation workflow guide](../guides/documentation-workflow.md)
- [Documentation organization and discovery](documentation-organization-and-discovery.md) · [Organizing and naming documentation](../guides/organizing-and-naming-documentation.md)
- [Documentation quality](documentation-quality.md)
- [Practice](practice.md)
- [Standard](standard.md)
- [Tutorial explainer](tutorial.md) · [Tutorial guide](../guides/tutorial.md)
- [How-to explainer](how-to.md) · [How-to guide](../guides/how-to.md)
- [Reference explainer](reference.md) · [Reference guide](../guides/reference.md)
- [Explanation explainer](explanation.md) · [Explanation guide](../guides/explanation.md)
- [Principle explainer](principle.md) · [Principle guide](../guides/principle.md)
- [Pattern explainer](pattern.md) · [Pattern guide](../guides/pattern.md)
- [Pattern library](../patterns/pattern-library.md)
- [Playbook](../patterns/playbook.md) · [Runbook](../patterns/runbook.md)
