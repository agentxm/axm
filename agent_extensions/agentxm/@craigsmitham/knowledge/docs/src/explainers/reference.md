---
type: Explainer
title: Reference explainer
description: What reference documentation is — austere, authoritative technical description for lookup at work, not teaching, instructing, or discursive why.
tags: [docs, reference, diataxis, explanation]
status: stable
sources:
  - id: diataxis-reference
    resource: https://diataxis.fr/reference/
    title: Diátaxis — Reference
  - id: diataxis-reference-src
    resource: https://github.com/evildmp/diataxis-documentation-framework/blob/main/source/reference.rst
    title: Diátaxis source — reference.rst
  - id: diataxis-start
    resource: https://diataxis.fr/start-here/
    title: Diátaxis — Start here
  - id: diataxis-ref-explanation
    resource: https://diataxis.fr/reference-explanation/
    title: Diátaxis — Reference vs explanation
  - id: diataxis-ref-explanation-src
    resource: https://github.com/evildmp/diataxis-documentation-framework/blob/main/source/reference-explanation.rst
    title: Diátaxis source — reference-explanation.rst
  - id: johnson-diataxis
    resource: https://idratherbewriting.com/blog/what-is-diataxis-documentation-framework
    title: Tom Johnson — What is Diátaxis (reference pattern notes)
  - id: mintlify-content-types
    resource: https://www.mintlify.com/guides/content-types
    title: Mintlify — Content types (reference notes)
generated:
  by: grok/grok-4.5
---

# Reference explainer

**Reference** is **technical description** of the machinery and how to
operate it. It is **information-oriented**: propositional knowledge the user
consults while **at work** — truth and certainty under the hands, not a lesson
and not a discussion.

One hardly *reads* reference; one **consults** it. It should be **austere**,
orderly, and wholly authoritative — a map of the product territory so the
user need not rediscover the ground by trial.

The nutrition and allergen panel on a food packet is a strong everyday model:
standard shape, facts only, no recipes or marketing mixed into the labels
(mixing those can be literally dangerous).

To write it, use [Reference guide](../guides/reference.md).

## Place on the map

In Diátaxis, reference sits with **cognition** (what the user knows) and
**work** (application of skill):

| Axis | Reference’s side | Contrast |
| --- | --- | --- |
| Action vs cognition | Cognition / propositional knowledge | Tutorials and how-tos direct **action** |
| Study vs work | Work (lookup while applying skill) | Explanation also states theory, but for **study** — reflection away from the task |

So reference and explanation both carry theoretical knowledge, yet they
answer different needs: apply vs acquire. Reference and how-to both serve
work: how-to **directs action**; reference **states facts** for lookup while
acting.

Its vantage is a **close-up of the machinery**. Content is led by the
**product structure**, not by a user’s task narrative or learning path.
Software examples: APIs, classes, functions, CLI flags, config keys, error
codes.

## Orientation

| | |
| --- | --- |
| **Reader need** | Information / lookup |
| **Success** | The reader finds the fact or interface detail quickly and trusts it matches the system as shipped |
| **Voice** | Neutral, objective, factual — austere and consistent; not a lesson and not a sales pitch |
| **Typical prompt** | *What is…?* · *What does this accept / return / mean?* · *What are the flags for…?* |
| **Title cue** | Names the surface (*Widget API*, `deploy` command, *Error codes*) — description, not *How to* or *About* essay |

## What belongs

- **Neutral description** — accurate, precise, complete, and clear for the
  claimed surface
- Structure that **mirrors the machinery** (map ↔ territory): modules,
  classes, methods, commands in relations that match the product
- **Standard patterns** — same headings, field order, and naming so similar
  things are found where expected
- Specifications of inputs, outputs, options, limits, errors, terms
- **Examples** that illustrate the thing itself (usage snippet), without
  expanding into a how-to or explanation essay
- Warnings where misuse is dangerous (*You must… You must not…*)
- Auto-generated material when it stays faithfully accurate to the code —
  generation is a means to fidelity, not a substitute for the rest of the
  docs set

## What does not belong

- A guided **learning path** for newcomers (tutorial)
- Goal-oriented **“how do I ship X”** procedures (how-to) — describe
  operation of the machine; link tasks out
- Discursive **why**, history, or design philosophy (explanation) — even when
  examples tempt *what if* expansion
- Soft, incomplete coverage that forces guesswork at lookup time
- Marketing claims or opinion mixed into the factual layer
- Story-shaped pages that hide the parameter the reader needed

## Quality signals

- Entries are easy to **scan and compare**; patterns repeat across the set
- Naming and structure stay consistent; the map still matches the product
- Facts match the shipped system; drift is corrected or the page is retired
- Readers are not forced through a narrative to extract a single parameter
- Instruction and explanation appear as **links**, not bulk digressions
- After consulting, the reader has a **firm fact** — not a finished lesson or
  completed production goal

Rules of thumb when form is ambiguous:

- Boring, unmemorable, lists and tables → often **reference**
- Something you would read in the bath as discussion → often **explanation**
- Needed **while working** a task → reference; needed **away from work** to
  understand → explanation

## Language that fits reference

Useful shapes (paraphrased from Diátaxis):

- State facts about the machinery and its behaviour (*Django’s default
  logging configuration inherits Python’s defaults…*)
- List commands, options, operations, features, flags, limitations, errors
  (*Sub-commands are: a, b, c…*)
- Provide warnings where appropriate (*You must use a. You must not apply b
  unless c. Never d.*)

Prefer scannable structure over prose: tables, fixed field order, and short
examples that copy cleanly.

## Reference vs explanation (the hard boundary)

Both live in the theory half of the map. The difference is **work vs
study**:

| | Reference | Explanation |
| --- | --- | --- |
| User mode | Work — apply skill | Study — acquire understanding |
| Purpose | Describe the machinery for lookup | Illuminate a topic for reflection |
| Form | Dry, austere description | Discursive discussion |
| Structure | Follows the product | Circles a bounded topic |
| Opinion | Out of place | Allowed and often needed |
| Prompt | *What is…?* while hands-on | *Can you tell me about…?* away from the console |

Expansive examples in reference that grow into *why* and *what if* are a
common bleed: they interrupt lookup and starve explanation of its own
home.

## Failure modes (common)

- **Auto-gen as the whole docs set** — reference alone is not tutorials,
  how-tos, or explanation
- **Instruction and digression mid-entry** — natural to write, wrong for
  consultability
- **Inconsistent entry shapes** — the map no longer matches user expectation
- **Structure that ignores the product** — arbitrary chapter order that
  fights the machinery
- **Absorbed how-to or explanation** — tasks and essays living only inside
  “API overview”
- **Stale facts** — reference goes cold fastest; trust dies first

## Related

- [Reference guide](../guides/reference.md)
- [Documentation craft](documentation-craft.md)
- [Tutorial explainer](tutorial.md)
- [How-to explainer](how-to.md)
- [Explanation explainer](explanation.md)
