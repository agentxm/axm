---
type: Explainer
title: How-to explainer
description: What a how-to guide is — goal-oriented directions for real work, written from the user's problem not the machinery, without becoming a lesson or a catalog.
tags: [docs, how-to, guide, diataxis, explanation]
status: stable
sources:
  - id: diataxis-how-to
    resource: https://diataxis.fr/how-to-guides/
    title: Diátaxis — How-to guides
  - id: diataxis-how-to-src
    resource: https://github.com/evildmp/diataxis-documentation-framework/blob/main/source/how-to-guides.rst
    title: Diátaxis source — how-to-guides.rst
  - id: diataxis-start
    resource: https://diataxis.fr/start-here/
    title: Diátaxis — Start here
  - id: diataxis-start-src
    resource: https://github.com/evildmp/diataxis-documentation-framework/blob/main/source/start-here.rst
    title: Diátaxis source — start-here.rst
  - id: diataxis-tutorials-how-to
    resource: https://diataxis.fr/tutorials-how-to/
    title: Diátaxis — The difference between a tutorial and how-to guide
  - id: diataxis-tutorials-how-to-src
    resource: https://github.com/evildmp/diataxis-documentation-framework/blob/main/source/tutorials-how-to.rst
    title: Diátaxis source — tutorials-how-to.rst
  - id: johnson-diataxis
    resource: https://idratherbewriting.com/blog/what-is-diataxis-documentation-framework
    title: Tom Johnson — What is Diátaxis (how-to pattern notes)
  - id: mintlify-content-types
    resource: https://www.mintlify.com/guides/content-types
    title: Mintlify — Content types (Diátaxis-aligned how-to notes)
generated:
  by: codex/gpt-5.6
  at: 2026-08-15T15:48:17Z
---

# How-to explainer

A **how-to guide** is **directions** that lead the reader through a problem or
toward a result. It is **goal-oriented** and **task-oriented**: it helps
someone already competent get work done correctly and safely in a real
situation.

It serves the user **at work**, not at study. The obligation is to help
accomplish a named task — not to provide a learning experience.

A recipe is a strong everyday model: a specific *How do I make…?*, competence
assumed, teaching and history left out while cooking — practical
problem-solving steps for a competent user, not a lesson and not a concept
essay.

To write one, use [How-to guide](../guides/how-to.md).

## Place on the map

In Diátaxis, how-to sits with **action** (what the user does) and **work**
(application of skill), not with study or pure lookup:

| Axis | How-to’s side | Contrast |
| --- | --- | --- |
| Action vs cognition | Action / practical directions | Reference and explanation inform what the user *knows* |
| Study vs work | Work (apply skill to a real goal) | Tutorial also directs action, but for **study** — a managed lesson |

So how-to and tutorial both sequence steps, yet they answer different needs:
learning vs doing. Conflating them is the most common failure in product
docs.

Its vantage is the **user’s problem-field** — eye-level work with tools as
means, not as the subject. The unit is a **human project or goal**, not a
feature of the machinery. Guides may cut across tools and subsystems when the
job does.

How-to and reference both serve work: how-to **directs action**; reference
**states facts** for lookup while acting.

## Orientation

| | |
| --- | --- |
| **Reader need** | Doing / problem-solving |
| **Success** | The goal is completed correctly under realistic conditions |
| **Voice** | Practical expert: sequence of actions, judgment when needed, assumptions brief |
| **Typical prompt** | *How do I…?* · *How can I achieve X in this situation?* · *What steps get me to Y?* |
| **Title cue** | Often *How to …* stating the **outcome**, not a bare topic name |

## What belongs

- A **named goal or problem** framed from the user’s need (a human project),
  not from “operations the product exposes”
- An **executable approach**: actions in a logical sequence — including when
  to *think* and *judge*, not only button presses
- Preconditions the competent reader must already meet (access, tools, prior
  skill); link a tutorial when basics may be missing
- **Real-world adaptability** — branches, *if this, then that*, alternate
  routes when the path cannot be fully managed
- Pitfalls and recovery that block the goal in production-like conditions
- Pointers to reference (full options/inventories) and explanation (*why*)
  instead of swallowing them

A good catalog of how-tos also sketches what the product can *do* for real
work — not only how widgets behave.

## What does not belong

- A beginner’s end-to-end **lesson** under instructor responsibility
  (tutorial) — even when the procedure is “basic”
- The authoritative exhaustive **inventory** of flags, fields, or APIs
  (reference) — link it
- Extended **rationale**, history, or design philosophy (explanation) — the
  wrong time to digress is mid-task
- Tool-centric “take the machinery through its motions” with no human purpose
  (e.g. restating that the Deploy button deploys)
- An open-ended sphere of skill (*How to build a web application*) rather than
  a bounded goal
- Multiple unrelated goals packed into one undifferentiated document
- Completeness-as-virtue that dilutes action with every related option

How-tos are **not only linear procedures**. Real problems often fork, overlap,
and need judgment; forcing a single rigid script can mis-serve work.

## Quality signals

- The goal is clear before the first step; the title says exactly what the
  guide shows
- Steps are actionable and ordered for the **real system**, with **flow** that
  matches how the user thinks, switches context, and holds work in mind
  (pace and rhythm, not only a numbered list)
- Competence is assumed; basics are linked, not re-taught as the body
- Complexity is real-world adaptable, not a single brittle demo path
- Explanation and reference appear as **links**, not bulk digressions
- One guide owns a given procedure; others link instead of forking a copy
- After following, the reader has **done the job** — not merely finished a
  lesson or scanned a catalog

## Language that fits how-to

Useful shapes (paraphrased from Diátaxis):

- *This guide shows you how to…* (name the problem or result)
- *If you want x, do y. To achieve w, do z.* (conditional imperatives)
- *If this, then that. In the case of …, an alternative is…*
- *Refer to the x reference guide for a full list of options.*
- *Before you start: …* (preconditions only as far as this goal needs)

Prefer titles that encode the outcome (Diátaxis naming grades):

| Grade | Title | Why |
| --- | --- | --- |
| Good | *How to integrate application performance monitoring* | Says exactly what the guide shows |
| Bad | *Integrating application performance monitoring* | Could be whether to, not how to |
| Very bad | *Application performance monitoring* | Topic only — how, whether, or what? |
| Good | *How to rotate the API token* | Outcome-encoded |
| Bad | *Tokens* | Topic, not task |

## How-to vs tutorial (the hard boundary)

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

- **Tutorial/how-to conflation** — a lesson that pretends to be production
  guidance, or a runbook that tries to teach from zero
- **Basic/advanced confusion** — treating all how-tos as “advanced only,” or
  all tutorials as “simple only”; either form can be basic or specialized
- **Machinery-first guides** — organized by product surface instead of user
  goals; little meaning for someone with a job to finish
- **Absorbed explanation or reference** — theory and full option lists
  mid-procedure “for completeness”
- **Unscoped ambition** — a vague sphere of practice with no landable result
- **Brittle narrowness** — works only for one demo setup; unusable when the
  reader’s real case differs slightly
- **Forked procedures** — the same goal maintained in multiple places that
  drift

## Related

- [How-to guide](../guides/how-to.md)
- [Documentation craft](documentation-craft.md)
- [Tutorial explainer](tutorial.md)
- [Reference explainer](reference.md)
- [Explanation explainer](explanation.md)
