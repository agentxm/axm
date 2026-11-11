---
type: Pattern
title: How-to guide
description: When competent readers need to achieve a bounded real-world goal, organize adaptable directions around the task, its conditions, and a verifiable result.
tags:
- docs
- how-to
- guide
- diataxis
- explanation
- documentation-pattern
- pattern
- authoring
status: draft
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
  title: Tom Johnson — What is Diátaxis (how-to notes)
- id: mintlify-content-types
  resource: https://www.mintlify.com/guides/content-types
  title: Mintlify — Content types (Diátaxis-aligned how-to notes)
- id: python-logging-cookbook
  resource: https://docs.python.org/3/howto/logging-cookbook.html
  title: Python — Logging Cookbook
generated: { by: codex/gpt-6, at: 2026-11-11T19:52:17Z }
---

# How-to guide

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

## Design problem and context

A competent reader has a specific outcome in mind but does not know how to
achieve it in this system. Their environment and constraints may differ from
the author's. A tour of features leaves the plan to the reader, while a rigid
script may fail under ordinary variation.

Use this pattern for a bounded task with identifiable completion criteria.
Choose a tutorial when skill acquisition is the primary need; use a playbook
when assessing the situation and selecting a response is the central problem.

## Design response and tradeoffs

Organize directions around the user's goal. State applicability and
prerequisites, order actions by their real dependencies, explain supported
choices where they arise, and show how to verify completion. Link to facts
and rationale that readers may need along the way.

- **Directness versus variation:** keep the main route easy to follow while
  making consequential alternatives visible.
- **Completeness versus assumed competence:** include what is specific to this
  task without reteaching the whole practice.
- **Adaptability versus precision:** explain decision criteria without leaving
  critical actions or results to guesswork.

The reader gains an actionable route that can accommodate supported conditions.
Branches and system details increase the maintenance burden; a guide becomes
misleading when its scope grows beyond the paths the author can verify.

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
| **Selection cue** | The situation, symptom, event, or reader intent for which this outcome-oriented procedure is appropriate |

## What belongs

- A **named goal or problem** framed from the user’s need (a human project),
  not from “operations the product exposes”
- An applicability statement that lets a reader recognize the situation in
  which this guide is the right route before starting it
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
  guide shows, while its description pairs that outcome with the situation or
  intent that makes the guide relevant
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
- *Use this when… so that…* (selection condition and supported outcome)
- *If you want x, do y. To achieve w, do z.* (conditional imperatives)
- *If this, then that. In the case of …, an alternative is…*
- *Refer to the x reference guide for a full list of options.*
- *Before you start: …* (preconditions only as far as this goal needs)

Selection conditions and preconditions answer different questions. “Use this
when a test credential reaches scheduled expiry” explains why the reader chose
the guide; “you need credential-administration access” explains what must be
true after selection. Do not use one as a substitute for the other.

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

## Authoring steps

1. **Name one goal from the user’s problem-field** — frame a human project or
   result (*how to calibrate the radar array*, *how to rotate the API token*),
   not operations the machinery exposes (*press Deploy to deploy*). Tools are
   means; the job defines what the guide covers — even when it cuts across
   subsystems.

2. **Title and describe for selection** — prefer *How to …* that encodes the
   outcome. In the description, pair that outcome with the situation, symptom,
   event, or reader intent that makes this guide the right route. Search
   engines, indexes, humans, and agents need enough context to choose before
   opening it. Use a literal event only when the work is event-driven.

3. **Assume competence; state preconditions only as needed** — the reader
   already knows what they want and can follow instructions. List access,
   tools, and prior skill briefly. Link a tutorial when basics may be missing;
   never re-teach them as the body (recipe ≠ cooking lesson). Preconditions
   establish readiness after selection; they do not explain when to select the
   guide.

4. **Write an executable approach (a contract)** — *if you face this
   situation, take these steps.* Steps are **actions**: physical acts **and**
   thinking or judgment. Solving a problem is not only button presses.

5. **Order for a logical sequence** — put first what later steps require, or
   what sets up the reader’s working environment or thinking. Order is not
   arbitrary even when two operations are technically commutative.

6. **Seek flow** — ground the sequence in how the user actually works and
   thinks: minimize thrashing between contexts and tools; avoid forcing them
   to hold unresolved thoughts longer than necessary; keep pace and rhythm
   steady. Aim for the guide that anticipates the next tool they need.

7. **Address real-world complexity** — adapt, do not script one demo. Use
   *if this, then that*, forks, overlaps, and alternate routes. How-tos are
   **not only linear procedures**; judgment is often required.

8. **Omit the unnecessary** — practical usability beats completeness.
   Start and end in a meaningful place and let the reader join the guide to
   *their* work. Leave options, history, and digression out of the path.

9. **Surface blockers and recovery** — prepare for the unexpected: name the
   failure signals that stop the goal under production-like conditions, and
   how to recover from them. The user owns risk; you still help them navigate
   it.

10. **Link out for depth** — reference for full flags/fields/inventories;
    explanation for *why*. Digression mid-task dilutes action; link instead.

11. **Verify on the real system** — walk the path against current behavior;
    fix drift before publish. Retire or rewrite when the path no longer works.

12. **Own the procedure** — one guide per goal; others link. Do not fork a
    second full copy that will drift.

## Before writing

- A bounded, testable goal (not an open-ended skill sphere such as *how to
  build a web application*)
- Clarity on role and assumed skill
- Access to the current system so steps can be verified

## Additional authoring pitfalls

- **Broken flow** — repeated context thrash, arbitrary order, or a rigid
  script where real work forks.
- **Multiple unrelated goals** packed into one undifferentiated document.

## Example and evidence

An illustrative guide to sending application logs to a file would state the
supported environment, show the configuration changes, address relevant
deployment choices, and verify that an expected record reaches the file.
It assumes readers already know how to run their application.

[Diátaxis how-to guidance](https://diataxis.fr/how-to-guides/) supplies the
goal-oriented rationale. Individual recipes in the
[Python Logging Cookbook](https://docs.python.org/3/howto/logging-cookbook.html)
show tasks such as logging across modules with concrete configurations and
examples. The cookbook is a collection of recipes, not one bounded task.

This pattern description is a draft synthesis. These sources support the
task-oriented arrangement; they do not validate every recommended authoring
step or prove success across arbitrary environments.

## Related

- [Tutorial](tutorial.md) — a predecessor when the reader still needs the
  assumed skills.
- [Runbook](runbook.md) — specializes task guidance for repeatable operational
  execution with explicit verification, recovery, and escalation.
- [Playbook](playbook.md) — helps select or reconsider a response before a
  bounded task is ready for execution.
- [Reference](reference.md) — supplies exact facts without duplicating the
  system's inventory inside the directions.
- [Documentation craft](../explainers/documentation-craft.md) — selecting and combining documentation patterns.
- [Writing a document](../explainers/documentation-craft.md) — the shared authoring process.
