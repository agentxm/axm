---
type: Pattern
title: Pattern description
description: When recurring design experience needs to be shared, name its essential property or strategy and explain context, variation, consequences, and evidence so practitioners can recognize and adapt it.
tags:
- docs
- pattern
- documentation-pattern
- pattern-description
- pattern-mining
- evidence
- forces
- generativity
- review
- authoring
status: draft
sources:
- id: cockburn-patterns-2023
  resource: https://alistaircockburn.com/Talk%202023-10%20PLOP%2030%20yrs%20patterns.pdf
  title: Alistair Cockburn — The take-home value of a pattern is its name (PLoP 2023 talk)
- id: elephants-patterns-heuristics
  resource: https://wirfs-brock.com/rebecca/papers/ElephantsPatternsAndHeuristics/
  title: Rebecca Wirfs-Brock and Christian Kohls — Elephants, Patterns, and Heuristics
- id: generative-patterns
  resource: https://wirfs-brock.com/rebecca/papers/explrgenpat2023/
  title: Lise Hvatum and Rebecca Wirfs-Brock — Exploring the Generative Nature of Patterns
- id: pattern-smells
  resource: https://wirfs-brock.com/rebecca/papers/patternsmells/
  title: Rebecca Wirfs-Brock and Christian Kohls — Pattern Smells, Get Rid of Them (2026 preprint)
- id: constructive-feedback
  resource: https://wirfs-brock.com/rebecca/papers/constructivefeedback/
  title: Christian Kohls and Rebecca Wirfs-Brock — Constructive Feedback Using Pattern Smells (2026 preprint)
- id: saga
  resource: https://microservices.io/patterns/data/saga.html
  title: Chris Richardson — Saga
- id: idempotent-receiver
  resource: https://www.enterpriseintegrationpatterns.com/patterns/messaging/IdempotentReceiver.html
  title: Gregor Hohpe and Bobby Woolf — Idempotent Receiver
generated:
  by: codex/gpt-6
  at: '2026-11-11T17:28:28Z'
---

# Pattern description

A **pattern description** communicates recurring design knowledge so another
practitioner can recognize a problem, assess a response, and adapt it. Its
subject can be software, operations, organizations, or another design domain.

## Design problem and context

Practitioners repeatedly encounter a recognizable problem and use variations
of a response. Local examples contain useful experience, but readers cannot
tell which details are essential, why the response works, or where it stops
being appropriate. A name alone gives them too little to make a new realization.

Use this documentation pattern when there is experience to examine and a
reader who needs reusable design guidance. If recurrence is uncertain, write
a **candidate** or **proto-pattern** and state the missing evidence. A new idea
does not become an established pattern by acquiring the right headings.

## What the description represents

A **pattern** is the recurring problem–solution relationship in context; its
**description** communicates that relationship; an **instance** realizes it.
A template fixes form, a principle directs judgment, and a procedure guides
execution. Each may embody a pattern without being equivalent to its
description.

A pattern can express a **property to establish** or a **strategy to apply**.
Explain how either responds to the problem; neither requires a fixed procedure.
This distinction follows Cockburn's [talk, slide 19](https://alistaircockburn.com/Talk%202023-10%20PLOP%2030%20yrs%20patterns.pdf#page=19).

Descriptions necessarily select and generalize. Readers bring experience and
heuristics to fill in local decisions; novices may need more concrete
guidance. This distinction draws on
[Elephants, Patterns, and Heuristics](https://wirfs-brock.com/rebecca/papers/ElephantsPatternsAndHeuristics/).

**Generativity** concerns what using a pattern enables people to create and how
it affects the surrounding design. Explain possible adaptations and effects,
but distinguish those possibilities from observed outcomes. Strong claims
require evidence beyond a well-written description; see
[Exploring the Generative Nature of Patterns](https://wirfs-brock.com/rebecca/papers/explrgenpat2023/).

## Design response and tradeoffs

Connect a recognizable problem to a constructive solution through its context,
competing forces, and consequences. Make the relationship understandable enough
to adapt, with evidence that readers can inspect and limits they can recognize.

- **Generality versus useful detail:** retain the invariant while showing the
  decisions that vary between instances.
- **Brevity versus rationale:** make the idea easy to scan without hiding why
  apparently simpler alternatives fail.
- **Conviction versus uncertainty:** offer usable guidance while distinguishing
  observed results, interpretation, and untested expectations.
- **Consistency versus local judgment:** give readers a shared vocabulary
  without implying that the name determines the right design.

The resulting description makes experience discussable and transferable.
Generalization can erase a crucial constraint, and polished writing can make
weak evidence look stronger than it is. Continued review and feedback are part
of maintaining the description.

For this documentation pattern, distinguish its own limits: a bounded local
task may need a how-to rather than a pattern description; appropriate pattern
writing takes analysis and continuing evidence maintenance; excessive use of
pattern form can bury straightforward advice in unnecessary structure.

## Name and thumbnail

Choose a name readers can remember and use in a design conversation. Pair it
with a short thumbnail that stands alone: a recognizable situation and the
essential property or strategy that addresses it. Make the idea accessible
before expanding its rationale and evidence. Cockburn emphasizes these roles in
[slides 15–21](https://alistaircockburn.com/Talk%202023-10%20PLOP%2030%20yrs%20patterns.pdf#page=15).

For example, a thumbnail for this pattern could be: *When useful design
experience is difficult to transfer, give the recurring response a name and
explain its context, adaptable core, and limits.* A thumbnail supports
recognition; the full description supports informed application.

## Applicability, costs, and excessive use

Ask three separate questions: when is the pattern unsuitable; what costs
accompany appropriate use; and what harm follows from applying it too broadly,
too intensely, or too often? Cockburn calls the last category overdose effects
in [slides 22–24](https://alistaircockburn.com/Talk%202023-10%20PLOP%2030%20yrs%20patterns.pdf#page=22).

Use these as review questions within the host's form, not compulsory headings.
Describe observable signs that should prompt reconsideration where the evidence
supports them. Do not invent numerical thresholds to make the advice look exact.

## Authoring steps

1. **Bound the inquiry.** Identify the domain, reader, recurring difficulty,
   target artifact, and available experience. Search for existing descriptions
   and overlapping names before inventing a new one.
2. **Mine the experience.** Gather occurrences, constraints, variations,
   outcomes, and failed or contrasting cases. Record provenance and whether
   uses are independent; copied examples are not independent evidence.
3. **Identify the recurring relationship.** Separate the essential property or
   strategy from incidental local choices. Mark which decisions remain open to
   the practitioner and show contrasting realizations and a case outside its fit.
   Explain the problem without presupposing the proposed solution. Identify
   which forces compete and how satisfying one affects another.
4. **Describe a constructive response.** Explain what the practitioner can
   arrange, change, or combine, including meaningful variation. Show the
   resulting context, ordinary costs, conditions for rejecting the response,
   and harms from excessive application. Introduce it with a useful name and
   thumbnail before expanding the account.
5. **Make evidence inspectable.** Attribute each material claim to its source
   or observation. Distinguish known uses from synthetic examples and proposed
   applications. Respect source rights; do not manufacture provenance.
6. **Review and revise.** Apply the questions below, then check related
   descriptions, links, previews, and host metadata. Revisit field evidence
   when writing exposes a gap. An author's review is not independent validation.

Run only the stages the request needs. Missing evidence can support a
provisional description and a precise open question; it cannot support a
stronger claim of recurrence or effectiveness.

## Description anatomy

These are semantic questions, not mandatory headings or a universal template:

| Element | Reader question |
| --- | --- |
| Name and thumbnail | Can I recognize, remember, and discuss the essential response? |
| Context and problem | Where does this tension recur? |
| Forces | Why is choosing a response difficult? |
| Solution and variation | What property or strategy matters, and which decisions can I adapt? |
| Consequences | What improves, what does appropriate use cost, and what goes wrong through overuse? |
| Applicability | When does it fit, and when should I reject it? |
| Evidence | Which observations support which claims? |
| Relationships | What alternatives or next choices matter? |

Keep local commands and environment-specific procedures in their appropriate
documents when they obscure this reusable relationship.

## Review the solution, analysis, and expression

First ask whether the response is grounded in actual experience. Then examine
whether the analysis connects context, problem, forces, solution, and
consequences. Finally improve how the description communicates that account.
This prioritization draws on
[Constructive Feedback Using Pattern Smells](https://wirfs-brock.com/rebecca/papers/constructivefeedback/).

Use smells such as missing forces, implausible assumptions, or benefits-only
consequences as prompts for investigation. They are not automatic defects or
a numerical quality score; the source
[Pattern Smells, Get Rid of Them](https://wirfs-brock.com/rebecca/papers/patternsmells/)
offers a vocabulary for diagnosing concerns.

For each material concern, identify the passage or observation, the affected
claim, its consequence for the reader, and a concrete revision or evidence
needed. Recognize strengths as well. Review-only work reports findings; it
does not silently revise the document or implement the described solution.

Check whether examples reveal both the essential response and room for
variation. If every detail seems obligatory, readers may copy one realization
without understanding the pattern. If the examples share only a goal, they may
represent different solutions. The [variance discussion in Pattern Smells](https://wirfs-brock.com/rebecca/papers/patternsmells/)
supports labeling these boundaries explicitly.

For an authoring check, try a fresh case: what would a reader preserve, change,
or reject, and why? Actual reader trials can expose assumptions this walkthrough
misses; neither establishes broader outcomes without evidence from application.

## Illustrative example

Suppose several teams handle uncertain work by trying a bounded pilot before
making a wider commitment. A candidate description would identify the decision
uncertainty, what keeps the pilot informative and reversible, the cost of delay,
and cases where a small trial cannot represent the real setting.

One realization might trial a new meeting format with one team before extending
it. Another might try a revised support workflow for a limited class of requests.
The shared response is a bounded learning opportunity before wider commitment;
duration, participants, and observations vary with the question. A change whose
essential effects appear only at organization-wide scale is a contrasting case:
a small pilot may not answer the relevant question.

The pilot plan is an instance; the description explains the reusable design.
This hypothetical example supplies no evidence that the proposed pattern
actually recurs or produces good outcomes.

## Observed descriptions and evidence limits

Richardson's [Saga](https://microservices.io/patterns/data/saga.html) separates
context, problem, forces, solution, variants, and resulting consequences.
Hohpe and Woolf's
[Idempotent Receiver](https://www.enterpriseintegrationpatterns.com/patterns/messaging/IdempotentReceiver.html)
uses a compact problem and solution presentation with alternatives and related
patterns; the public page is an excerpt.

These independently authored examples demonstrate recurring ways to communicate
design knowledge with different presentation choices. They do not evaluate
this page's authoring workflow. This draft is the bundle's synthesis of the
cited work, not a prescribed process from those authors.

Cockburn's estimates about how many patterns people can learn in a workshop
are experience-based counsel, not fixed limits adopted by this bundle.

## Related

- [Pattern collection](pattern-collection.md) — organizes related descriptions
  and helps readers select among them.
- [Explanation](explanation.md) — develops supporting concepts when they need
  a fuller treatment.
- [Principle document](principle.md) — communicates a warranted direction for
  judgment when no recurring solution relationship is being claimed.
- [How-to guide](how-to.md) — directs a particular task instead of describing
  a reusable design.
