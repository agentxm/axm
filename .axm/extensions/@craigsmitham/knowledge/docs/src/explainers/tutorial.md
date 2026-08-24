---
type: Explainer
title: Tutorial explainer
description: What a tutorial is — a learning-oriented lesson under tutor responsibility, with a safe success path, and what it deliberately leaves out.
tags: [docs, tutorial, learning, diataxis, explanation]
status: stable
sources:
  - id: diataxis-tutorials
    resource: https://diataxis.fr/tutorials/
    title: Diátaxis — Tutorials
  - id: diataxis-tutorials-src
    resource: https://github.com/evildmp/diataxis-documentation-framework/blob/main/source/tutorials.rst
    title: Diátaxis source — tutorials.rst
  - id: diataxis-start
    resource: https://diataxis.fr/start-here/
    title: Diátaxis — Start here
  - id: diataxis-tutorials-how-to
    resource: https://diataxis.fr/tutorials-how-to/
    title: Diátaxis — The difference between a tutorial and how-to guide
  - id: diataxis-tutorials-how-to-src
    resource: https://github.com/evildmp/diataxis-documentation-framework/blob/main/source/tutorials-how-to.rst
    title: Diátaxis source — tutorials-how-to.rst
  - id: johnson-diataxis
    resource: https://idratherbewriting.com/blog/what-is-diataxis-documentation-framework
    title: Tom Johnson — What is Diátaxis (tutorial pattern notes)
  - id: mintlify-content-types
    resource: https://www.mintlify.com/guides/content-types
    title: Mintlify — Content types (tutorial notes)
generated:
  by: grok/grok-4.5
---

# Tutorial explainer

A **tutorial** is a **lesson** — an **experience** under the guidance of a
tutor. It is always **learning-oriented**: the user _does_ something
meaningful toward an achievable goal so they can **acquire** skill, not so
they can finish a production task.

The obligation is a **successful learning experience**. What the learner
_does_ is not always what they _learn_; through action they pick up names,
tools, workflows, confidence, and how things relate.

Teaching a child to cook is a strong everyday model: success is what the
child gains and whether they want to return to the kitchen — not culinary
perfection or a complete dish every time.

To write one, use [Tutorial guide](../guides/tutorial.md).

## Place on the map

In Diátaxis, tutorial sits with **action** (what the user does) and **study**
(acquisition of skill):

| Axis                | Tutorial’s side              | Contrast                                                   |
| ------------------- | ---------------------------- | ---------------------------------------------------------- |
| Action vs cognition | Action / practical steps     | Reference and explanation inform what the user _knows_     |
| Study vs work       | Study (learn under guidance) | How-to also directs action, but for **work** — a real goal |

So tutorial and how-to both sequence steps, yet they answer different needs:
learning vs doing. Conflating them is the most common failure in product
docs.

Its vantage is the **managed lesson**: the teacher sets the path, tools, and
encounters. The unit is a **learning journey**, not a human production goal
and not an inventory of the machinery.

## Orientation

|                    |                                                                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| **Reader need**    | Learning / acquisition of skill                                                                                        |
| **Success**        | Confidence and familiarity; a completed path that worked; desire to return and practice                                |
| **Voice**          | Tutor leading a lesson — we are in this together; not a manual listing options                                         |
| **Typical prompt** | _Can you teach me to…?_ · _Help me get my first success with…_                                                         |
| **Title cue**      | Often _Getting started…_, _Your first…_, or _In this tutorial we will…_ — a lesson frame, not _How to_ production work |

## Contract of the lesson

Nearly all responsibility falls on the **teacher** (the document author):
what will be learned, what the pupil will do, and the pupil’s success. The
pupil’s duty is attention and following directions — not already knowing, and
not owning production risk.

The exercise must be:

- **meaningful** — a sense of achievement
- **successful** — completable by the intended learner
- **logical** — the path makes sense
- **usefully complete** — encounter with the actions, concepts, and tools
  that matter for this lesson

In written docs the tutor is **present in text but absent in person** — so
the path must aspire to work every time; observation and testing find the
gaps a live teacher would catch.

## What belongs

- A clear picture of **where the learner will be going** (_In this tutorial
  we will create… Along the way we will encounter…_) — not the presumptuous
  _you will learn…_
- **Concrete actions** in a managed, often single-line path; small steps;
  **visible results early and often**
- A **narrative of the expected** — what output should look like; likely
  signs of going wrong; preparation for surprising volume of output
- Prompts to **notice** the environment (close the learning loop)
- **Minimal** in-path explanation (_We’re using HTTPS because it’s more
  secure_) with links out for depth
- Room for **repetition** of successful steps where reversible
- Enough scene-setting to start; cut optional branches and catalogs

## What does not belong

- Extended **explanation** mid-lesson — it breaks learning focus; link
  instead
- **Choices and alternatives** that dilute the path to conclusion
- Exhaustive options, edge cases, and configuration **catalogs** (reference)
- Production troubleshooting for arbitrary real goals (how-to)
- Abstraction and generalisation as the teaching method — learning moves
  from concrete particular toward general patterns
- A production how-to labeled “tutorial,” or a tutorial that pretends to be
  the full product manual

## Quality signals

- A suitable beginner can complete it without inventing missing steps
- Every step serves the learning path; dead ends are rare
- Results are visible and meaningful along the way
- Failure modes that routinely block _this_ lesson are handled or avoided
- Explanation and option lists appear as **links**, not bulk digressions
- After finishing, the learner has **confidence and familiarity** — not only
  a shipped production outcome or a scanned catalog

## Language that fits tutorials

Useful shapes (paraphrased from Diátaxis):

- _We…_ / _In this tutorial, we will…_ (shared journey; name the accomplishment)
- _First, do x. Now, do y. Now that you have done y, do z._ (no ambiguity)
- _We must always do x before y because… (see Explanation for more details)._
  (minimal _why_; link out)
- _The output should look something like…_
- _Notice that… Remember that… Let’s check…_
- _You have built a…_ (mildly admire what they accomplished)

## Tutorial vs how-to (the hard boundary)

Both are practical sequences of steps. The difference is **need**, not
basic-vs-advanced:

|            | Tutorial                                                           | How-to                                                                                            |
| ---------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| User mode  | Study — acquire skill                                              | Work — apply skill                                                                                |
| Purpose    | Successful learning experience                                     | Correct task completion                                                                           |
| Path       | Managed, often single line; eliminate surprise                     | Real world; prepare for the unexpected                                                            |
| Safety     | Must be safe to retry under the “teacher”                          | Cannot always promise safety; user owns risk                                                      |
| Choices    | Few or none mid-path                                               | Forks and alternatives common                                                                     |
| Generality | One concrete, particular experience that builds transferable skill | Addresses a particular task, but framed to adapt across the varying real conditions readers bring |
| Competence | May lack even the right questions                                  | Assumed to ask the right question                                                                 |

A clinical training pad (lesson) vs a surgical procedure manual (work) is the
same distinction as a sandboxed “first project” vs “deploy blue-green with
rollback.”

## Failure modes (common)

- **Tutorial/how-to conflation** — production guidance labeled as a lesson,
  or a lesson that pretends to be a runbook
- **Teaching by explaining** — long theory mid-path that dissolves attention
  instead of _doing_
- **Choice overload** — every option and alternative on the first path
- **No early success** — long setup before any meaningful result
- **Unreliable path** — steps that often fail; confidence collapses
- **Basic/advanced confusion** — treating tutorials as “simple only”;
  advanced lessons still follow the same study contract

## Related

- [Tutorial guide](../guides/tutorial.md)
- [Documentation craft](documentation-craft.md)
- [How-to explainer](how-to.md)
- [Reference explainer](reference.md)
- [Explanation explainer](explanation.md)
