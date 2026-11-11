---
type: Pattern
title: Tutorial
description: When readers need to acquire a skill, lead them through a safe, bounded lesson with meaningful actions and visible results that build confidence for further practice.
tags:
- docs
- tutorial
- learning
- diataxis
- explanation
- documentation-pattern
- pattern
- authoring
status: draft
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
  title: Tom Johnson — What is Diátaxis (tutorial notes)
- id: mintlify-content-types
  resource: https://www.mintlify.com/guides/content-types
  title: Mintlify — Content types (tutorial notes)
- id: python-tutorial
  resource: https://docs.python.org/3/tutorial/
  title: Python — The Python Tutorial
generated: { by: codex/gpt-6, at: 2026-11-11T19:52:17Z }
---

# Tutorial

A **tutorial** is a **lesson** — an **experience** under the guidance of a
tutor. It is always **learning-oriented**: the user *does* something
meaningful toward an achievable goal so they can **acquire** skill, not so
they can finish a production task.

The obligation is a **successful learning experience**. What the learner
*does* is not always what they *learn*; through action they pick up names,
tools, workflows, confidence, and how things relate.

Teaching a child to cook is a strong everyday model: success is what the
child gains and whether they want to return to the kitchen — not culinary
perfection or a complete dish every time.

## Design problem and context

A reader entering an unfamiliar practice lacks both skill and the confidence
to choose useful actions. Describing every capability leaves them to design
their own lesson; handing them a production task assumes the competence they
are trying to acquire.

Use this pattern when an author can provide a bounded exercise and a reliable
environment for the intended learners. Choose a how-to instead when the reader
already has the skill and needs to accomplish real work.

## Design response and tradeoffs

Build one purposeful learning journey: establish the starting conditions,
sequence concrete actions, show expected results, and invite the learner to
notice what happened. Select encounters that teach transferable ideas, with
links for later exploration.

- **Reliable success versus realistic complexity:** constrain the environment
  enough to support learning while keeping the exercise meaningful.
- **Guidance versus independence:** remove premature choices, then provide a
  next practice opportunity rather than claiming mastery from one completion.
- **Momentum versus understanding:** use brief explanations at the point of
  need and move deeper discussion outside the lesson.

The result is an approachable first experience, with deliberate gaps in
coverage. Authors take on the cost of testing the path as tools and learner
assumptions change; successful completion alone does not prove transfer.

## Place on the map

In Diátaxis, tutorial sits with **action** (what the user does) and **study**
(acquisition of skill):

| Axis | Tutorial’s side | Contrast |
| --- | --- | --- |
| Action vs cognition | Action / practical steps | Reference and explanation inform what the user *knows* |
| Study vs work | Study (learn under guidance) | How-to also directs action, but for **work** — a real goal |

So tutorial and how-to both sequence steps, yet they answer different needs:
learning vs doing. Conflating them is the most common failure in product
docs.

Its vantage is the **managed lesson**: the teacher sets the path, tools, and
encounters. The unit is a **learning journey**, not a human production goal
and not an inventory of the machinery.

## Orientation

| | |
| --- | --- |
| **Reader need** | Learning / acquisition of skill |
| **Success** | Confidence and familiarity; a completed path that worked; desire to return and practice |
| **Voice** | Tutor leading a lesson — we are in this together; not a manual listing options |
| **Typical prompt** | *Can you teach me to…?* · *Help me get my first success with…* |
| **Title cue** | Often *Getting started…*, *Your first…*, or *In this tutorial we will…* — a lesson frame, not *How to* production work |

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

- A clear picture of **where the learner will be going** (*In this tutorial
  we will create… Along the way we will encounter…*) — not the presumptuous
  *you will learn…*
- **Concrete actions** in a managed, often single-line path; small steps;
  **visible results early and often**
- A **narrative of the expected** — what output should look like; likely
  signs of going wrong; preparation for surprising volume of output
- Prompts to **notice** the environment (close the learning loop)
- **Minimal** in-path explanation (*We’re using HTTPS because it’s more
  secure*) with links out for depth
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
- Failure modes that routinely block *this* lesson are handled or avoided
- Explanation and option lists appear as **links**, not bulk digressions
- After finishing, the learner has **confidence and familiarity** — not only
  a shipped production outcome or a scanned catalog

## Language that fits tutorials

Useful shapes (paraphrased from Diátaxis):

- *We…* / *In this tutorial, we will…* (shared journey; name the accomplishment)
- *First, do x. Now, do y. Now that you have done y, do z.* (no ambiguity)
- *We must always do x before y because… (see Explanation for more details).*
  (minimal *why*; link out)
- *The output should look something like…*
- *Notice that… Remember that… Let’s check…*
- *You have built a…* (mildly admire what they accomplished)

## Tutorial vs how-to (the hard boundary)

Both are practical sequences of steps. The difference is **need**, not
basic-vs-advanced:

| | Tutorial | How-to |
| --- | --- | --- |
| User mode | Study — acquire skill | Work — apply skill |
| Purpose | Successful learning experience | Correct task completion |
| Path | Managed, often single line; eliminate surprise | Real world; prepare for the unexpected |
| Safety | Must be safe to retry under the “teacher” | Cannot always promise safety; user owns risk |
| Choices | Few or none mid-path | Forks and alternatives common |
| Generality | One concrete, particular experience that builds transferable skill | Addresses a particular task, but framed to adapt across the varying real conditions readers bring |
| Competence | May lack even the right questions | Assumed to ask the right question |

A clinical training pad (lesson) vs a surgical procedure manual (work) is the
same distinction as a sandboxed “first project” vs “deploy blue-green with
rollback.”

## Failure modes (common)

- **Tutorial/how-to conflation** — production guidance labeled as a lesson,
  or a lesson that pretends to be a runbook
- **Teaching by explaining** — long theory mid-path that dissolves attention
  instead of *doing*
- **Choice overload** — every option and alternative on the first path
- **No early success** — long setup before any meaningful result
- **Unreliable path** — steps that often fail; confidence collapses
- **Basic/advanced confusion** — treating tutorials as “simple only”;
  advanced lessons still follow the same study contract

## Authoring steps

1. **Show where the lesson is going** — one outcome, not a curriculum, framed
   as a shared journey (*In this tutorial we will create…*), not a
   presumptuous *you will learn…*.
2. **Choose a minimal path** — the smallest sequence that reaches that outcome
   reliably; cut optional branches.
3. **Set the scene briefly** — only what is needed to start (tools, sample
   project, assumptions). Defer catalogs to reference.
4. **Write concrete steps** — each step is an action the learner performs;
   show expected intermediate results where silence would strand them.
5. **Keep the path safe** — prefer defaults and happy path; handle only the
   failures that commonly block this lesson.
6. **Close the lesson** — confirm success; optionally point to a how-to or
   reference for real-world next steps (do not turn the ending into a manual).
7. **Walk the path yourself** (or have someone new try it) — fix missing steps
   before publishing.

## Before writing

- An environment or sample the learner can actually use
- Confidence the happy path still works

## Additional authoring pitfalls

- **Promissory framing** — opening with *you will learn…* instead of showing
  where we are going and what we will do.
- **Silent output** — steps that never narrate expected results, stranding
  the learner at the first surprise.

## Example and evidence

An illustrative service tutorial might guide a newcomer through sending one
request in a disposable environment, inspecting the response, and changing one
input. It ends with a working result and a next exercise; production rollout
belongs elsewhere.

[Diátaxis tutorials](https://diataxis.fr/tutorials/) supplies the lesson-oriented
design rationale. The [Python Tutorial](https://docs.python.org/3/tutorial/)
illustrates a stated learner audience, executable examples, and selective
coverage with links to reference. It assumes prior programming knowledge and
is broader than a single first-success lesson.

This pattern description is a draft synthesis of established guidance and
observed documentation features. These sources do not establish the
effectiveness of this full formulation for a particular learner group.

## Related

- [How-to guide](how-to.md) — a follow-on for applying acquired skill to real
  tasks; an alternative when the reader already has that skill.
- [Explanation](explanation.md) — develops the rationale a lesson introduces
  briefly, without interrupting its sequence.
- [Reference](reference.md) — supplies exact details for later exploration.
- [Learning checklist](learning-checklist.md) — adds bounded practice prompts,
  feedback, and a plan to fade instructional support toward independent use.
- [Documentation craft](../explainers/documentation-craft.md) — selecting and combining documentation patterns.
- [Writing a document](../explainers/documentation-craft.md) — the shared authoring process.
