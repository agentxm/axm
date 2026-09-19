---
type: Explanation
title: Field notes
description: How field notes preserve one operational occurrence with observed facts, safe diagnostic evidence, impact, detection, recovery, and explicitly tentative interpretation.
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
  - id: who-minimal-information
    resource: https://qualityhealthservices.who.int/quality-toolkit/qt-catalog-item/minimal-information-model-for-patient-safety-incident-reporting-and-learning-systems-user-guide
    title: WHO — Minimal Information Model for Patient Safety Incident Reporting and Learning Systems
  - id: ahrq-report-design
    resource: https://www.ahrq.gov/patient-safety/reports/hotline/design2.html
    title: AHRQ — Developing and Testing the Health Care Safety Hotline
generated:
  by: codex/gpt-5
  at: 2026-08-24T21:16:03Z
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

The note combines a small common structure with a free evidence narrative. That
shape follows mature incident-learning systems: enough standard fields to
compare reports, while preserving the reporter's account in their own
terms.[^who-minimal-information] It records what was expected, what was
observed, impact, recovery, detection, and conditions directly seen. The
expected-versus-observed comparison retains the practical core of after-action
review.[^army-aar]

Cause is deliberately separate. `Observed factors` carries facts;
`Hypothesis` carries the reporter's tentative explanation; `Suggests` carries
an optional improvement idea. A hypothesis is useful intake, but repeating it
does not make it true. Reporting-form research similarly limits structured
contributing factors to conditions reporters can observe reliably.[^ahrq-report-design]

It also records **observed impact**: what this incident delayed, degraded,
repeated, or prevented, plus directly measured cost such as retries, extra
steps, elapsed time, rework, or unusable output. Impact is evidence about the
incident, not a severity score. The observer does not predict how often it will
recur, extrapolate to people or systems not observed, or estimate hypothetical
harm. An unmeasured cost stays `not measured` rather than becoming a guess.

Each note has a unique occurrence identity, an observation time, and an opaque
session identity. The occurrence ID prevents same-day repeats from colliding;
the session ID lets later triage distinguish two reports from two independent
occasions. The pattern key is only a candidate classification and never replaces
either identity.

Detection and recovery complete the operational account. Detection says how the
gap became visible — command output, a test, user correction, inspection, or
another signal. Recovery says what restored progress and whether the original
task completed. Together they distinguish obvious, easily reversible friction
from delayed or silent behavior with an expensive workaround.

## Why capture is in-situ

Recording at the moment of occurrence rather than in retrospect is the single
design choice that most affects data quality; retrospective accounts lose
detail and reshape events toward coherence.[^esm-survey]

An agent session has an unusual property here: it has no memory across sessions,
so anything not written during the session is gone completely rather than merely
degraded. Capture must therefore be cheap enough to happen inline, which means
appending a small file and continuing — never investigating, fixing, or
escalating what was just observed.

## Preserve evidence before reducing it

In-situ capture begins before the note is written. Structured command and API
results often carry the only durable retrieval keys for an operational
occurrence: a stable error class, request or correlation identifier, response
status, retry decision, recovery command, or artifact integrity. A formatter
that keeps only a human summary, a pipeline that hides the failing process
status, or suppressed diagnostic output can destroy that evidence before the
capture rule runs.

The practice therefore preserves a small **diagnostic envelope** until capture
eligibility is decided. It contains only already-observed fields that help
retrieve, verify, or compare the incident. It is not a raw transcript: secrets,
authorization material, opaque response bodies, and unreviewed values stay out
of a public note. Nor does preservation authorize a second mutation merely to
recover a missing identifier.

Missing evidence has two materially different meanings. `Not supplied` means
the authoritative result did not expose the field. `Unavailable — output was
not retained` means the observing workflow discarded it. Keeping that
distinction visible lets triage separate a product observability gap from a
capture-process gap without guessing at either cause.

## Notes are not findings

Two artifacts, deliberately separate:

- A **field note** is raw, cheap, unreviewed, and possibly duplicated. Volume is
  expected. One incident, one file, appended and abandoned. Single incidents
  remain notes even when their observed cost deserves attention.
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
[^who-minimal-information]: WHO, *Minimal Information Model for Patient Safety Incident Reporting and Learning Systems*.
[^ahrq-report-design]: AHRQ, *Developing and Testing the Health Care Safety Hotline*.
