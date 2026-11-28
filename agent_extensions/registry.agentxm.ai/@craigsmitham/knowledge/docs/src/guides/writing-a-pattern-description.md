---
type: Guide
title: How to write a pattern description
description: When a design response seems to recur, compare its uses, draft the choice and consequences, and check what another practitioner can infer from the description.
tags: [docs, pattern, pattern-description, authoring, pattern-mining, review, smells, evidence]
status: draft
sources:
- id: elephants
  resource: https://wirfs-brock.com/rebecca/papers/ElephantsPatternsAndHeuristics/
  title: Elephants, Patterns, and Heuristics
- id: smells
  resource: https://wirfs-brock.com/rebecca/papers/patternsmells/
  title: Pattern Smells, Get Rid of Them
- id: feedback
  resource: https://wirfs-brock.com/rebecca/papers/constructivefeedback/
  title: Constructive Feedback Using Pattern Smells
generated: { by: codex/gpt-6, at: 2026-11-22T01:48:28Z }
---

# How to write a pattern description

Begin with a design decision someone has actually faced. Look for existing
descriptions under names practitioners already use. If one fits, use its
name and cite it. Work out what your case adds, such as a new way to
apply the design or a limit the earlier account leaves open. If you have
a proposed solution and have yet to find a use, record it as a candidate.
A plausible illustration can help people discuss it while you search.

## Mine the decision from the cases

Suppose an organizer asks you to “document the separate pickup desk
pattern.” Ask for accounts of particular events. What were guests waiting
for? Who could change the arrangement? What happened afterward, including
to guests who still needed help? Keep the source of each account and mark
which details are your interpretation. A second event copying the first
event's handbook shares its provenance. Ask whether the response was used
there and what the organizers learned from it.

Imagine the following observations for a writing exercise. At one concert,
guests with preprinted tickets went straight to a pickup desk. At a
conference, a volunteer walked a single line and delivered prepared badges
to waiting guests. These are invented cases. In an actual mining effort,
retain independent records or accounts before claiming recurrence.

## Name what the realizations share

Describe the original problem without assuming a desk is the solution.
Both arrangements let people with completed registrations collect an
item without waiting for someone else's registration to be corrected.
One needs floor space for a separate desk. The other needs a volunteer
who can find a badge while moving through a queue. Try a name that fits
both, then give the reader a short account of the decision.[^elephants]

> **Separate pickup from exceptions** *(candidate)*. When most arrivals
> have a completed registration and a few need extended help, give ready
> arrivals a way to collect their items while staff resolve exceptions.
> A separate counter can work where there is space. With a single queue,
> someone can take the prepared items to the waiting guests.

Add the limitation beside the promise. If everyone needs the same identity
check before collection, the shared check may still control the queue.
Even when the design fits, two lines can confuse guests and split scarce
staff. Applying it at every small gathering could leave an idle pickup
clerk beside an overworked colleague. Seek evidence about those costs
from the guests and the staff who encounter them.

## Review the claim before polishing the wording

Ask a practitioner to bring a situation you have yet to discuss. Can they
recognize the decision, suggest a realization that fits, and identify a
condition that would make them decline? If they can only imagine buying
a second desk, return to the moving volunteer case. If they accept the
description anywhere people wait, sharpen the entry condition. These
are checks on what the words communicate. Evaluating effects on waiting
times requires observations during use.

In review, use a suspected pattern smell to start an inquiry. A claim that
everybody benefits may hide a cost to staff who now handle only difficult
cases. Give the author the passage and a question they can investigate.
*What happened to the exceptions line after the pickup desk opened?* Ask
for another case if the evidence is thin, a narrower claim if the cases
differ, or a clearer sentence if the reasoning is already sound. Match
feedback to the stage of work. Wording changes cannot supply missing
observations.[^smells][^feedback]

Finish by labeling the evidence accurately. With the two invented
examples above, the entry remains a candidate. With observed uses,
identify them and state which features and consequences the records
support. Preserve a counterexample when it changes who should use the
pattern. Revisit the description as experience extends or narrows that
boundary.

[^elephants]: Rebecca Wirfs-Brock and Christian Kohls, [Elephants, Patterns, and Heuristics](https://wirfs-brock.com/rebecca/papers/ElephantsPatternsAndHeuristics/).
[^smells]: Rebecca Wirfs-Brock and Christian Kohls, [Pattern Smells, Get Rid of Them](https://wirfs-brock.com/rebecca/papers/patternsmells/), 2026 preprint.
[^feedback]: Christian Kohls and Rebecca Wirfs-Brock, [Constructive Feedback Using Pattern Smells](https://wirfs-brock.com/rebecca/papers/constructivefeedback/), 2026 preprint.
