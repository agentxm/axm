---
type: Explanation
title: Closure
description: How field notes become improvements through evidence-led patterning, multidimensional priority, explicit decisions, and verified corrective action.
tags: [field-notes, closure, triage, findings, continuous-improvement, explanation]
status: draft
sources:
  - id: fracas
    resource: https://en.wikipedia.org/wiki/Failure_reporting,_analysis,_and_corrective_action_system
    title: Failure reporting, analysis, and corrective action system (FRACAS)
  - id: capa-riptide
    resource: https://compliancearchitects.com/capa-management/
    title: Caught in a CAPA Riptide? — Compliance Architects
  - id: nasa-llis
    resource: https://www.nextgov.com/people/2012/03/nasa-knowledge-management-database-used-rarely/205923/
    title: NASA knowledge management database used rarely (Nextgov)
  - id: near-miss-barriers
    resource: https://aeasseincludes.assp.org/proceedings/2012/docs/541.pdf
    title: Near-Miss Reporting — The Missing Link of Safety Culture (ASSP)
  - id: ubuntu-papercuts
    resource: https://en.wikipedia.org/wiki/Paper_cut_bug
    title: Paper cut bug — the Ubuntu One Hundred Paper Cuts project
  - id: ahrq-event-reporting
    resource: https://psnet.ahrq.gov/primer/reporting-patient-safety-events
    title: AHRQ PSNet — Reporting Patient Safety Events
  - id: fda-capa
    resource: https://www.fda.gov/files/Guide-to-Inspections-of-Quality-Systems.pdf
    title: FDA — Guide to Inspections of Quality Systems
  - id: google-sre-postmortems
    resource: https://sre.google/workbook/postmortem-culture/
    title: Google SRE — Postmortem Culture, Learning from Failure
  - id: osha-hazard-assessment
    resource: https://www.osha.gov/safety-management/hazard-identification
    title: OSHA — Hazard Identification and Assessment
generated:
  by: codex/gpt-5.6
  at: 2026-08-15T23:32:51Z
---

# Closure

Capture is the easy half. Every observation system that has failed, failed after
the reports were successfully collected.

## Recurrence is a signal, not a rate

A recurring observed pattern across independent occasions is stronger evidence
than one report. Promotion therefore has a threshold: at least two independent
occurrences from separate sessions. They must share observed behavior and
material conditions; they do not need to share an established cause.

The distinction matters because frontline explanations are hypotheses. Two
reporters repeating the same plausible explanation have not independently
confirmed it. Triage can promote a well-evidenced pattern with cause recorded as
`unknown — needs investigation`.

Report counts also do not establish prevalence. Voluntary reporting captures an
unknown fraction of events and supplies no exposure denominator by itself.[^ahrq-event-reporting]
Write `3 occurrences / 12 observed sessions` only when those sessions were
actually counted; otherwise write `3 occurrences / exposure unknown`.

Recurrence remains the finding threshold. A costly singleton stays a note but
enters a separate review lane when actual impact, urgency, observed extent, or
an evidence-supported potential consequence warrants attention.

## From notes to a finding

A **finding** is a curated proposal, not a larger field note. Triage first
clusters observed behavior, then separates supported contributing factors from
cause and records cause confidence. It checks readily available sources for
corroboration and extent without turning triage into an open-ended investigation.
Quality-system practice similarly expects complete, accurate, timely input;
comparison across sources; investigation proportionate to significance and
risk; and verified corrective action.[^fda-capa]

Priority is a reasoned disposition, not a score. A finding preserves:

- actual impact and comparable measured cost;
- independent recurrence and exposure when known;
- observed extent;
- urgency;
- evidence-supported potential consequence;
- detectability and recoverability;
- evidence and cause confidence; and
- known change cost and regression risk.

Actual impact says what happened. Potential consequence says what plausibly
could happen and belongs in triage, not capture. Urgency says why delay matters.
OSHA likewise treats severity and likelihood as inputs to prioritizing
corrective action rather than as interchangeable labels.[^osha-hazard-assessment]
Keeping the dimensions visible lets a human challenge the priority basis without
reverse-engineering a composite score.

## From finding to action

Promotion records `decision: proposed`; the user still decides. Acceptance adds
one accountable owner, an action type, and a verification window. Useful action
types are `investigate`, `prevent`, `mitigate`, `detect`, and `document`.

This mirrors mature reliability practice: actions need clear ownership,
priority, tracking, and measurable completion, while system changes are more
reliable than blame or vague instructions to be more careful.[^google-sre-postmortems]
An accepted action may still be wrong, so its verification must check both the
intended effect and material adverse effects.

## What closure means

A finding closes when the change is **verified to have worked** — not when it is
implemented. This distinction is the whole point of a closed-loop system: the
loop opens on a report and closes only after corrective action has been
confirmed effective.[^fracas]

The practical form: mark a landed change `applied`, wait for its stated date,
session count, or opportunity count, apply its verification criteria, and check
for new notes of the same class. A recurrence reopens the finding regardless of
what shipped.

| Status | Meaning |
| --- | --- |
| `open` | Recorded note, below threshold or not yet triaged |
| `promoted` | Recurrence confirmed; finding and decision proposed |
| `applied` | Accepted change landed; effectiveness window still open |
| `closed` | Intended effect and named adverse effects checked successfully |
| `dropped` | Removed from field-note triage with a recorded disposition |

`dropped` matters more than it looks. Without it, rejected observations or
notes moved to another workflow return every review cycle and the backlog never
converges.

## Three ways this fails

**The write-only store.** Reports accumulate; nobody reads them. NASA's
lessons-learned system was consulted so rarely that most centers stopped
contributing for years, despite formal requirements to use it — the diagnosed
cause was that the store was unsearchable, not that reports were
missing.[^nasa-llis] *Counter:* keep findings small and indexed, make triage a
scheduled act, and report dispositions back to the user. Failure to receive
feedback is itself a known barrier to reporting.[^ahrq-event-reporting]

**Overload.** When everything is escalated, queues grow, lead times stretch, and
investigation goes shallow.[^capa-riptide] *Counter:* the recurrence threshold,
the costly-singleton review lane, explicit priority bases, and a willingness to
mark things `dropped`.

**Silence.** Reporting stops when it is costly or risky. Over a quarter of
surveyed workers in one industry study cited reporting systems that were too
complex or time-consuming.[^near-miss-barriers] *Counter:* one small file,
appended without approval or interruption, with unknown values preferred over
capture-time investigation.

For observers that never tire and never fear consequences, the third failure
mode largely disappears and the second becomes dominant. Design effort should
go to triage and closure, not to encouraging capture.

## Batch the small things

Individually trivial friction is worth fixing in bounded rounds rather than one
item at a time. The Ubuntu paper-cuts campaigns defined a target class — a
usability defect fixable in about a day — and worked it in explicit rounds
against a release.[^ubuntu-papercuts] The framing makes small, individually
ignorable problems collectively legible and gives the effort an end.

[^fracas]: *Failure reporting, analysis, and corrective action system*.
[^nasa-llis]: *NASA knowledge management database used rarely*.
[^capa-riptide]: *Caught in a CAPA Riptide?*
[^near-miss-barriers]: *Near-Miss Reporting — The Missing Link of Safety Culture*.
[^ubuntu-papercuts]: *Paper cut bug* — Ubuntu One Hundred Paper Cuts.
[^ahrq-event-reporting]: AHRQ PSNet, *Reporting Patient Safety Events*.
[^fda-capa]: FDA, *Guide to Inspections of Quality Systems*.
[^google-sre-postmortems]: Google SRE, *Postmortem Culture: Learning from Failure*.
[^osha-hazard-assessment]: OSHA, *Hazard Identification and Assessment*.
