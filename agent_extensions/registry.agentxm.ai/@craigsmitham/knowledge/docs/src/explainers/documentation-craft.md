---
type: Explainer
title: Documentation craft
description: What effective documentation craft is — matching form to reader need, keeping each job recognizable, and respecting host conventions over portable layout rules.
tags:
- docs
- craft
- quality
- diataxis
- explainer
status: stable
generated: { by: codex/gpt-6, at: 2026-11-11T19:48:50Z }
sources:
- id: diataxis
  resource: https://diataxis.fr/
  title: "Di\xE1taxis documentation system"
- id: diataxis-start
  resource: https://diataxis.fr/start-here/
  title: "Di\xE1taxis \u2014 Start here"
- id: diataxis-start-src
  resource: https://github.com/evildmp/diataxis-documentation-framework/blob/main/source/start-here.rst
  title: "Di\xE1taxis source \u2014 start-here.rst"
- id: diataxis-map
  resource: https://diataxis.fr/map/
  title: "Di\xE1taxis \u2014 The map"
- id: diataxis-map-src
  resource: https://github.com/evildmp/diataxis-documentation-framework/blob/main/source/map.rst
  title: "Di\xE1taxis source \u2014 map.rst"
- id: diataxis-foundations
  resource: https://diataxis.fr/foundations/
  title: "Di\xE1taxis \u2014 Foundations"
- id: diataxis-foundations-src
  resource: https://github.com/evildmp/diataxis-documentation-framework/blob/main/source/foundations.rst
  title: "Di\xE1taxis source \u2014 foundations.rst"
- id: johnson-diataxis
  resource: https://idratherbewriting.com/blog/what-is-diataxis-documentation-framework
  title: "Tom Johnson \u2014 What is Di\xE1taxis"
- id: mintlify-content-types
  resource: https://www.mintlify.com/guides/content-types
  title: "Mintlify \u2014 Content types"
- id: pattern-description
  resource: ../patterns/pattern-description.md
  title: Pattern description
- id: pattern-collection
  resource: ../patterns/pattern-collection.md
  title: Pattern collection
- id: prior-documentation-craft
  resource: https://github.com/craigsmitham/agent-extensions/blob/333fc2fe7f67b0520f456efdb107e0730d04e069/knowledge/docs/src/guides/documentation-craft.md
  title: Documentation craft guide
---

# Documentation craft

Portable **understanding** of documentation quality — not repository layout,
frontmatter schemas, or tooling. Host projects may add structure, metadata,
and validators; those local rules win when they exist.

Choose documentation by what the reader needs to do: learn, complete a task,
look up facts, or understand a subject. Diátaxis supplies these four reader
needs. The [Documentation pattern collection](../patterns/index.md) describes
reusable document designs for these and more specific situations. Each pattern
connects a recurring reader problem to a design response, with applicability,
tradeoffs, evidence, and detailed authoring guidance. A particular tutorial or
runbook is an instance of the design described by its pattern.

For documenting patterns in any design domain, use
[Pattern description](../patterns/pattern-description.md) for the concepts,
evidence, authoring, and review of an individual description, and
[Pattern collection](../patterns/pattern-collection.md) for curation and
maintenance. These two entries own the general pattern guidance used throughout
the bundle, including the distinction between a collection and a language.
Draft entries identify where their formulations still need evidence from use.

“Explainer” is another name for an explanation document. “Guide” can be an
umbrella term; use **how-to guide** when specifically referring to directions
for accomplishing a task. These names do not prescribe host metadata or folders.

For iterative remediation of an existing corpus, see [Documentation workflow](documentation-workflow.md). For
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
them documentation types. This bundle describes their reusable design guidance
as patterns while retaining the distinctions between the reader needs.

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

| Reader need | Documentation pattern |
| --- | --- |
| Learn by doing | [Tutorial](../patterns/tutorial.md) |
| Achieve a concrete goal | [How-to guide](../patterns/how-to.md) |
| Look up facts or interfaces | [Reference](../patterns/reference.md) |
| Understand context and reasoning | [Explanation](../patterns/explanation.md) |

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

1. **One primary reader job per ordinary document.** When a document
   needs several coordinated parts, keep each job recognizable so readers
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

Authoritative sources establish product behavior and policy. Distinguish facts,
proposals, and illustrative examples; name unresolved authority rather than
inventing content. Relevant validators and exercised procedures provide bounded
evidence. An author's review does not establish reader comprehension.

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
each pattern description when form starts to slip.

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

The docs bundle maintainer owns this collection with the rest of the bundle.
Apply the [collection maintenance guidance](../patterns/pattern-collection.md#author-and-maintain-the-collection)
to proposed changes, and record revisions and retirements in the bundle log.

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

- [Documentation pattern collection](../patterns/index.md)
- [Documentation quality](documentation-quality.md)
- [Documentation audits](documentation-audits.md)
- [Documentation organization and discovery](documentation-organization-and-discovery.md)
