---
type: Explainer
title: Explanation explainer
description: What explanation documentation is — discursive, understanding-oriented discussion that joins context, perspectives, and why, without becoming a runbook or reference.
tags: [docs, explanation, understanding, diataxis]
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
generated:
  by: codex/gpt-5.6
  at: 2026-08-15T15:48:17Z
---

# Explanation explainer

An **explanation** is a discursive treatment of a topic that invites
**reflection**. It is **understanding-oriented**: it deepens and broadens
what the reader grasps, joins things into a bigger picture, and answers
questions like _why?_ and _Can you tell me about …?_

It is documentation one can usefully read **away from the product** — material
for study and thought rather than for hands on the console. Of the four
Diátaxis reader-need forms, it is the only one that might make sense to read “in the
bath.”

Harold McGee’s _On Food and Cooking_ is a strong everyday model: no recipes to
execute mid-kitchen, no ingredient tables to look up — the history, science,
and culture around cooking, so that practice becomes calmer and better
grounded.

Other names hosts use for the same job: _Discussion_, _Background_,
_Conceptual guides_, _Topics_.

To write one, use [Explanation guide](../guides/explanation.md).

## Place on the map

In Diátaxis, explanation sits with **cognition** (what the user knows) and
**study** (acquisition of skill), not with action or with application at
work:

| Axis                | Explanation’s side                     | Contrast                                                           |
| ------------------- | -------------------------------------- | ------------------------------------------------------------------ |
| Action vs cognition | Cognition / propositional knowledge    | Tutorials and how-tos direct action                                |
| Study vs work       | Study (understanding for its own sake) | Reference also states facts, but for **work** — lookup while doing |

So explanation is less _urgent_ than a broken how-to or missing reference, but
not less _important_: without it, knowledge of a craft stays loose and
anxious.

Its vantage is **higher and wider** than the other three forms. It is not the
user’s eye-level task view (how-to) or a close-up of the machinery
(reference). Its unit is a **topic** — a bounded area of knowledge — and it
may circle that topic from several directions.

The word _explain_ shares roots with **unfolding** — bringing into the light
what was implicit. _Understanding_ shares roots with **grasp** — holding the
craft so practice is less fragile.

## Orientation

|                    |                                                                                         |
| ------------------ | --------------------------------------------------------------------------------------- |
| **Reader need**    | Understanding / reflection                                                              |
| **Success**        | The topic is clearer; connections and tradeoffs make sense; practice feels less fragile |
| **Voice**          | Discussion: may digress, compare, and weigh perspectives when that aids insight         |
| **Typical prompt** | _Why is it this way?_ · _Can you tell me about X?_ · _How does this fit together?_      |
| **Title cue**      | Often reads as _About …_ (explicit or implicit)                                         |

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

## What does not belong

- A beginner’s end-to-end **lesson** (tutorial) — put minimal “why” in the
  lesson and link here for depth
- The only copy of an operational **procedure** (how-to)
- The authoritative exhaustive **inventory** of interfaces (reference)
- Instruction or technical description absorbed “while covering the topic” —
  explanation tends to swallow other forms if unbounded
- A topic with no spine — open-ended “everything about X” without a real or
  imagined _why_ (or similar prompt) to bound the page

## Quality signals

- A central understanding question is obvious near the top
- The piece could be read away from the product without feeling incomplete as
  _discussion_ (even if it links out for doing and lookup)
- Connections and context dominate; steps and field catalogs do not
- Opinions and alternatives are visible and distinguishable from hard system
  facts
- Scope is deliberately bounded; related action and facts live in how-tos and
  reference and are linked, not duplicated
- After reading, the reader’s model of the craft is richer — not merely a
  longer checklist

Test when form is ambiguous: would someone turn to this **while working** a
task, or **while studying** away from the console? Work → reference or
how-to; study of concepts → explanation.

## Language that fits explanation

Useful shapes (paraphrased from Diátaxis):

- _The reason for x is historically y …_
- _W is better than z here because …_
- _An x in this system is analogous to a w in that system; however …_
- _Some users prefer w (because z). That can work, but …_
- _An x interacts with a y as follows …_ (unfolding internals for insight)

## Explanation vs reference (the hard boundary)

Both live in the theory half of the map. The difference is **study vs
work**:

|           | Explanation                                     | Reference                         |
| --------- | ----------------------------------------------- | --------------------------------- |
| User mode | Study — acquire understanding                   | Work — apply skill                |
| Purpose   | Illuminate a topic for reflection               | Describe the machinery for lookup |
| Form      | Discursive discussion                           | Dry, austere description          |
| Structure | Circles a bounded topic                         | Follows the product               |
| Opinion   | Allowed and often needed                        | Out of place                      |
| Prompt    | _Can you tell me about…?_ away from the console | _What is…?_ while hands-on        |

Rules of thumb: lists and tables that are boring to “read” → often reference;
something imaginable as a discussion over a drink → often explanation.
Expansive examples in reference that grow into _why_ starve both jobs.

## Failure modes (common)

- **Scattered explanation** — tiny _why_ parcels only inside tutorials and
  how-tos, with no place to go for reflection
- **Tutorial overload** — lessons stuffed with theory the learner cannot use
  yet
- **Absorbed runbook or reference** — the “overview” is actually the missing
  how-to or API catalog
- **Unscoped essay** — no bounding question; the topic never lands
- **Neutral-only false discipline** — stripping all perspective so real
  craft tradeoffs stay invisible

## Related

- [Explanation guide](../guides/explanation.md)
- [Documentation craft](documentation-craft.md)
- [Tutorial explainer](tutorial.md)
- [How-to explainer](how-to.md)
- [Reference explainer](reference.md)
