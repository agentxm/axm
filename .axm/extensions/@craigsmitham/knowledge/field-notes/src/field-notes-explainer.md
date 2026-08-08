---
type: Explanation
title: Field notes
description: What the field notes practice is — the gap between work-as-imagined and work-as-done, why capture happens in-situ, why successful improvisation counts, and why notes and findings stay separate.
tags: [field-notes, observation, continuous-improvement, resilience-engineering, explanation]
status: draft
sources:
  - id: hollnagel-safety-ii
    resource: https://www.england.nhs.uk/signuptosafety/wp-content/uploads/sites/16/2015/10/safety-1-safety-2-whte-papr.pdf
    title: Erik Hollnagel — From Safety-I to Safety-II (white paper)
  - id: flanagan-cit
    resource: https://www.apa.org/pubs/databases/psycinfo/cit-article.pdf
    title: J.C. Flanagan — The Critical Incident Technique (Psychological Bulletin, 1954)
  - id: army-aar
    resource: https://www.first.army.mil/Portals/102/FM%207-0%20Appendix%20K.pdf
    title: FM 7-0 Appendix K — After Action Reviews
  - id: esm-survey
    resource: https://dl.acm.org/doi/10.1145/3123988
    title: The Experience Sampling Method on Mobile Devices (ACM Computing Surveys)
generated:
  by: claude/claude-opus-5
  at: 2026-08-08T14:42:20Z
---

# Field notes

A **field note** is a record of one specific incident, written while the work
that produced it is still happening.

The practice exists because the most valuable information about how a system
actually behaves is produced constantly and discarded immediately. Someone works
around a confusing command, guesses at an undocumented step, or waits on
something slow — and then finishes the task and forgets. The information was
free at the moment it occurred and is unrecoverable an hour later.

## The gap being observed

Instruction files, documentation, and runbooks describe **work-as-imagined**: an
idealized account of the task that cannot anticipate the conditions the work
actually meets.[^hollnagel-safety-ii] **Work-as-done** is what happens instead.
Systems keep working because people at the sharp end adapt across that gap.

A field note is one observation of that gap. This framing has a consequence that
a failure log does not: **the adaptations that succeeded are the most valuable
records in the set.** An undocumented workaround that worked is knowledge the
system depends on and has not written down. A log that only admits failures
throws it away.

That is why a note carries a `kind`:

| Kind | What it records |
| --- | --- |
| `gap` | Outcome differed from what the instructions or output implied |
| `workaround` | Succeeded by improvising a step no document describes |
| `blocked` | A subject in `target` mode was prevented from reaching its condition |

## Incidents, not impressions

The oldest form of this practice requires reports of **specific observed
incidents with behavioral detail**, never general opinions.[^flanagan-cit] The
constraint is what makes the records aggregable: ten incidents can be compared,
counted, and traced; ten impressions cannot.

"The CLI is confusing" is not a field note. "`init` exited 0 but wrote no
config, so I ran it twice before checking the exit path" is.

The note body uses four questions drawn from after-action review
practice:[^army-aar] what was expected, what actually happened, why they differed,
and what should change. The third question is where most of the value is — it
forces a claim about mechanism rather than a description of symptoms.

## Why capture is in-situ

Recording at the moment of occurrence rather than in retrospect is the single
design choice that most affects data quality; retrospective accounts lose
detail and reshape events toward coherence.[^esm-survey]

An agent session has an unusual property here: it has no memory across sessions,
so anything not written during the session is gone completely rather than merely
degraded. Capture must therefore be cheap enough to happen inline, which means
appending a small file and continuing — never investigating, fixing, or
escalating what was just observed.

## Notes are not findings

Two artifacts, deliberately separate:

- A **field note** is raw, cheap, unreviewed, and possibly duplicated. Volume is
  expected. One incident, one file, appended and abandoned.
- A **finding** is curated: a recurring pattern, promoted deliberately, carrying
  provenance back to the notes that produced it and a claim about what to change.

Collapsing the two produces a store that is too noisy to read and too expensive
to write. Keeping them separate lets capture stay free and judgment stay
occasional. How notes become findings is in [Closure](closure-explainer.md).

## Reporting is expected behavior

An observer asked to record its own confusion, retries, and improvisations is
being asked to report against its own apparent competence. Any such system must
say plainly that recording is the correct behavior and carries no implication of
failure, or the records quietly stop appearing.

[^hollnagel-safety-ii]: Hollnagel, *From Safety-I to Safety-II*.
[^flanagan-cit]: Flanagan, *The Critical Incident Technique*, 1954.
[^army-aar]: FM 7-0 Appendix K, *After Action Reviews*.
[^esm-survey]: *The Experience Sampling Method on Mobile Devices*.
