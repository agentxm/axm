---
type: Pattern
title: Reference
description: When readers need authoritative facts during work, organize accurate, consistently structured entries around the system so they can locate and compare details quickly.
tags:
- docs
- reference
- diataxis
- explanation
- documentation-pattern
- pattern
- authoring
status: draft
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
  title: Tom Johnson — What is Diátaxis (reference notes)
- id: mintlify-content-types
  resource: https://www.mintlify.com/guides/content-types
  title: Mintlify — Content types (reference notes)
- id: python-logging-reference
  resource: https://docs.python.org/3/library/logging.html
  title: Python — Logging reference
generated: { by: codex/gpt-6, at: 2026-11-11T19:52:17Z }
---

# Reference

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

## Design problem and context

A practitioner knows the subject or operation they need, but cannot reliably
remember its exact properties, parameters, constraints, or behavior. They need
to enter at an arbitrary point and compare entries. Narrative order and
inconsistent descriptions make that lookup difficult.

Use this pattern when the described surface and its authoritative source are
identifiable. Choose explanation for a connected account of why it works, or
a how-to when readers need a route to a goal.

## Design response and tradeoffs

Mirror the subject's useful structure in named, addressable entries. Give
comparable items consistent fields and vocabulary, identify the supported
version or scope, and connect each assertion to the maintained system or
other authority. Use concise examples to clarify facts.

- **Coverage versus scanability:** cover the promised surface while keeping
  each entry easy to inspect.
- **Consistency versus variation:** use common structure without hiding
  meaningful differences between items.
- **Exactness versus maintenance effort:** generated facts can help, but
  semantics, limits, and examples still need review.

Readers can find and compare facts without reading a lesson first. The
resulting material may be poor teaching on its own, and even a small stale
detail can invalidate a decision or procedure that depends on it.

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

These are clues, not deciding tests. A comparison table can explain a concept,
and a practitioner can pause during work to seek understanding. Classify by the
primary reader need; see [Explanation vs reference](explanation.md#explanation-vs-reference-the-hard-boundary).

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

## Authoring steps

1. **Define the surface** — which commands, APIs, configs, terms, or errors
   this page (or set) owns; exclude adjacent surfaces.
2. **Pick a repeating shape that mirrors the machinery** — same headings,
   field order, and naming for like entries so comparison is easy, with
   overall structure that follows the product (map ↔ territory).
3. **Describe, do not teach** — state what something is, accepts, returns, or
   means; avoid goal narratives and long motivation.
4. **Prefer completeness for the surface** — cover the set you claimed; mark
   unknowns honestly rather than omitting silently.
5. **Add examples only for clarity** — short illustrations of the thing itself,
   not end-to-end tutorials.
6. **Link out for doing and understanding** — how-tos for tasks, explanations
   for rationale.
7. **Tie to the source of truth** — regenerate from specs when possible, or
   schedule refresh when the system changes; retire stale pages.

## Before writing

- Access to the real interface (code, OpenAPI, CLI help, schema) you describe
- Agreement on naming consistent with the product

## Additional authoring pitfalls

- **Silent gaps** — claiming a surface but omitting entries or marking
  nothing as unknown, forcing guesswork at lookup time.
- **Describing intent, not the shipped system** — writing from design docs or
  memory without verifying against the current interface.

## Example and evidence

An illustrative configuration reference might give each setting a stable name,
type, default, allowed values, and version-specific constraints. A reader can
compare two settings without following an introductory lesson.

The [Python logging reference](https://docs.python.org/3/library/logging.html)
organizes classes, functions, and their behavior into addressable entries and
directs readers to tutorials and the cookbook for other needs. It illustrates
separation of lookup from learning and task guidance.
[Diátaxis reference guidance](https://diataxis.fr/reference/) supplies the
design rationale.

This pattern description is a draft synthesis. The observed structure supports
the proposed arrangement, not a measured claim about lookup speed or the
accuracy of every documented entry.

## Related

- [How-to guide](how-to.md) — arranges selected facts into directions for a
  goal; link to it when lookup alone leaves the task unresolved.
- [Explanation](explanation.md) — develops relationships and rationale that
  would obscure quick lookup.
- [Tutorial](tutorial.md) — introduces unfamiliar concepts through a guided
  experience before assuming readers can use the reference independently.
- [Documentation craft](../explainers/documentation-craft.md) — selecting and combining documentation patterns.
- [Writing a document](../explainers/documentation-craft.md) — the shared authoring process.
