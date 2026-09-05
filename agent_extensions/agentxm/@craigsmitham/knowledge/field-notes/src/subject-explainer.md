---
type: Explanation
title: Subjects
description: What a field note subject is — survey versus target mode, what makes a usable target condition, how a survey subject graduates, and when a subject retires.
tags: [field-notes, subjects, target-condition, scoping, explanation]
status: draft
sources:
  - id: rother-obstacle-parking-lot
    resource: https://www.gembaacademy.com/school-of-lean/toyota-kata/improvement-kata-essentials/how-to-use-the-obstacles-parking-lot
    title: Toyota Kata — How to use the Obstacles Parking Lot
  - id: rother-starter-kata
    resource: https://assets.super.so/13796670-9a77-43ea-8ec1-f2266f161389/files/d206667f-f649-494a-afdf-bd424d532e47.pdf
    title: Mike Rother — The Toyota Kata Starter Kata
  - id: flanagan-cit
    resource: https://www.apa.org/pubs/databases/psycinfo/cit-article.pdf
    title: J.C. Flanagan — The Critical Incident Technique (Psychological Bulletin, 1954)
generated:
  by: claude/claude-opus-5
  at: 2026-08-08T14:42:20Z
---

# Subjects

A **subject** is a declared area of standing attention. Work that falls within a
subject produces field notes; work outside every subject produces none.

Subjects exist to make observation selective. An observer told to record anything
interesting records either nothing or everything, and both outcomes are useless.
A small set of named subjects — two or three is a working number — makes the
question at any moment answerable: *does this fall under something we are
watching?*

## Two modes

The mode determines the trigger breadth, the evidence bar, and what counts as
done. It is not a label; it changes behavior.

| | `survey` | `target` |
| --- | --- | --- |
| You know | The area is costly | The specific outcome you want |
| Trigger | Broad — any work touching the area | Narrow — tied to the target condition |
| Evidence bar | Low; capture anything anomalous | High; specific incidents only |
| Promotion | None; accumulate first | Recurrence threshold |
| Exit | A target condition can be stated | Target condition met and holding |

The distinction resolves a real tension. Structured improvement practice normally
logs obstacles *relative to an already-named target
condition*.[^rother-obstacle-parking-lot] But often the point is to discover what
the obstacles are — and the original incident-collection method was built
precisely to **derive** requirements nobody had yet articulated.[^flanagan-cit]
Both are legitimate; they are different phases, not different practices.

## Target conditions

A subject in `target` mode carries a **target condition**: a concrete
description of the process operating as desired, specific enough that a note can
state whether it was blocked.

Usable — observable, and failure is recognizable:

> A first-time user completes `init` without opening documentation or retrying.

Not usable — nothing can be measured against it:

> The CLI should be easier to use.

Write target conditions about the *process operating*, not about work getting
done.[^rother-starter-kata] "Ship the new installer" is a task. "Installation
succeeds on first attempt" is a condition the process either satisfies or does
not.

## Graduation

**The output of a survey subject is a target condition, not a fix.** This
is the most valuable moment in the practice: diffuse annoyance becomes a
falsifiable statement.

A survey subject is ready to graduate when its accumulated notes cluster
into a recognizable pattern and the cluster can be restated as a condition the
process would satisfy if the pattern disappeared. At that point, change the mode
to `target`, write the target condition, narrow the scope, and raise the
evidence bar. Notes recorded during the survey stay attached — they are the
evidence for the target condition.

If a survey subject accumulates notes that never cluster, that is also an
answer. The area may be genuinely fine, or scoped too broadly to say anything
about. Retire it or split it.

## Retirement

Every subject declares a retirement condition when it is created. A subject with
no stated end becomes permanent overhead: the cost is paid on every session, and
the benefit decays as the underlying problem is solved or forgotten.

Reasonable retirement conditions:

- A subject in `target` mode has held its target condition for a stated period
  with no new `blocked` notes.
- A survey subject has graduated to `target`.
- A survey subject has accumulated enough notes without a pattern to
  conclude the area is not the problem.
- The area is no longer worth attention regardless of state.

Retiring a subject does not delete its notes or findings. It stops collection.

[^rother-obstacle-parking-lot]: *Toyota Kata — How to use the Obstacles Parking Lot*.
[^flanagan-cit]: Flanagan, *The Critical Incident Technique*, 1954.
[^rother-starter-kata]: Rother, *The Toyota Kata Starter Kata*.
