---
type: Explainer
title: Documentation craft
description: Why one subject can call for different documents, how a reader’s purpose shapes each, and how the forms can work together.
tags:
- docs
- craft
- quality
- diataxis
- explainer
status: stable
generated: { by: codex/gpt-6, at: 2026-11-22T01:48:07Z }
sources:
- id: diataxis-start
  resource: https://diataxis.fr/start-here/
  title: "Di\xE1taxis \u2014 Start here"
- id: diataxis-map
  resource: https://diataxis.fr/map/
  title: "Di\xE1taxis \u2014 The map"
- id: diataxis-foundations
  resource: https://diataxis.fr/foundations/
  title: "Di\xE1taxis \u2014 Foundations"
- id: prior-documentation-craft
  resource: https://github.com/craigsmitham/agent-extensions/blob/333fc2fe7f67b0520f456efdb107e0730d04e069/knowledge/docs/src/guides/documentation-craft.md
  title: Documentation craft guide
---

# Documentation craft

How can a writer tell when one subject needs two kinds of documentation?
Suppose a choir keeps its rehearsal notes online. A new singer
looking up a repeat sign needs a short definition. Someone learning to
follow repeats needs a passage to sing and a way to tell where to come
back in. Both readers can open the same site. Their questions call for
different documents.

A software team documenting a repeatable operation such as restoring a
backup faces a similar choice. To decide whether a runbook would help
operators, the author can consult a [pattern](../patterns/runbook.md)
that weighs the design and its costs. To write the runbook, they need
an [authoring guide](../guides/writing-a-runbook.md). To understand why
operators can follow different branches of the same procedure, they can
turn to an [explainer](runbook.md). Someone searching for “runbook”
could plausibly want any of the three.

“Explainer” is another name for an explanation document. “Guide” can be an
umbrella term. A *how-to guide* gives directions for accomplishing a task.

## Why four reader needs

Diátaxis considers the [practitioner](practice.md) acquiring or applying
a skill. At either point the reader may need to act or to think something
through. These two distinctions yield four needs. They explain why a lesson
feels different from a lookup entry even when both cover the same subject.
The reader's need can change during a visit.[^diataxis-foundations][^diataxis-map]

| Need | Form | User mode | Documentation informs |
| --- | --- | --- | --- |
| Learning | Tutorial | Study + action | Skill acquisition through doing |
| Goals | How-to | Work + action | Task completion in the real world |
| Information | Reference | Work + cognition | Facts for lookup while working |
| Understanding | Explanation | Study + cognition | Context and reflection |

Consider what happens if the choir puts the definition of a repeat sign
halfway through the singing lesson. The learner can use the definition
just where the sign appears. The singer who reaches rehearsal with five
minutes to spare must now work through a lesson to find a fact. If the
definition has an address of its own, the teacher can still link to it,
and the singer can go straight there. Whether those two pages live under
Rehearsal or under separate headings for lessons and reference depends
on how people find them. The distinction between learning and looking up
survives either arrangement.

## What the reader can decide before opening a page

A heading such as “Repeats” identifies the subject of both pages.
“Following first and second endings” tells a singer which skill the
lesson offers. A how-to for a rehearsal leader preparing individually
marked parts would need a different cue. Saying who wants the result and
under what circumstances helps readers choose it from a search result.
The materials they need once they begin belong with the directions.

The choice of form also changes what a writer needs to check. Can a singer
find the sign in the score from its description? Can a learner hear where
to come back in after following the exercise? Both depend on the score
being accurate. Each calls for a different demonstration of usefulness.
Other claims need other evidence. A recording can establish what happened
at a rehearsal, an adopted policy settles the choir’s attendance rule, and
a reproducible example can establish what a software command does.[^prior-documentation-craft]

## Other named documents

The collection also includes designs for more specific purposes that may
combine several reader needs:

- A [Principle document](../patterns/principle.md) articulates a recognized good
  and gives sourced direction for judgment, with scope and limits. The pattern
  describes the document design; the principle is the direction it communicates.
- A [playbook](../patterns/playbook.md) supports assessment, response selection,
  and coordination as a situation develops.
- A [runbook](../patterns/runbook.md) supports repeatable execution of a bounded
  operational task, including verification and recovery.
- A [checklist](../patterns/checklist.md) puts bounded prompts at the point of
  work to address omissions or coordination gaps. Its purpose-specific patterns
  cover execution, verification, readiness, reporting and review, and learning.
  The use protocol, evidence, and response to unmet items are part of its design.

A [practice](practice.md) is the activity documentation supports, not another
document type. A [standard](standard.md) supplies a recognized basis for
judgment or coordination; documenting it does not by itself establish authority.

## Select and combine patterns

Consider documentation for a service that accepts requests and sometimes needs
recovery. This illustrative sequence shows complementary choices, not a required
set of pages:

1. A **tutorial** gives a new practitioner a safe first request and visible
   result. Link to **reference** for the exact request fields.
2. An **explanation** connects retries, failures, and duplicate effects. A
   **principle document** can communicate the warranted direction that governs
   choices where those concerns conflict.
3. A **how-to guide** helps a competent practitioner configure the service for
   a real goal, drawing on the same reference.
4. A **playbook** guides assessment when errors rise. If rollback is selected,
   a **runbook** supplies its bounded execution, verification, and recovery.
5. A **verification checklist** can support a consequential runbook pause,
   while a **readiness checklist** brings current evidence to the role deciding
   whether to proceed. A **learning checklist** can scaffold the tutorial's
   practice; its learning claim needs later independent evidence.

Start with the actual problem, choose only the patterns it needs, and follow
their relationships when another reader need emerges. Pattern descriptions
help authors make those choices; they do not require every resulting document
to reproduce the description's headings.

The docs bundle maintainer owns this collection. The
[collection maintenance guide](../guides/curating-a-pattern-collection.md)
covers proposed changes. Revisions and retirements belong in the
[bundle log](../log.md).

Diátaxis encourages authors to start with a change they can use today.[^diataxis-start]
For an example of a collection growing from recurring reader questions,
see [Documentation workflow](documentation-workflow.md).

## Related

- [Documentation pattern collection](../patterns/index.md)
- [Documentation quality](documentation-quality.md)
- [Documentation audits](documentation-audits.md)
- [Documentation organization and discovery](documentation-organization-and-discovery.md)

[^diataxis-foundations]: Diátaxis, [Foundations](https://diataxis.fr/foundations/).
[^diataxis-map]: Diátaxis, [The map](https://diataxis.fr/map/).
[^diataxis-start]: Diátaxis, [Start here](https://diataxis.fr/start-here/).
[^prior-documentation-craft]: [Earlier documentation craft guide](https://github.com/craigsmitham/agent-extensions/blob/333fc2fe7f67b0520f456efdb107e0730d04e069/knowledge/docs/src/guides/documentation-craft.md).
