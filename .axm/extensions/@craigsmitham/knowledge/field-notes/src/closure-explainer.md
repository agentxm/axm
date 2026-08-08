---
type: Explanation
title: Closure
description: How field notes become improvements — the recurrence threshold, promotion to findings, what counts as verified closure, and the three documented ways observation systems fail.
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
generated:
  by: claude/claude-opus-5
  at: 2026-08-08T14:42:20Z
---

# Closure

Capture is the easy half. Every observation system that has failed, failed after
the reports were successfully collected.

## Recurrence is the signal

A single incident does not justify a durable change. It may have been a bad
session, a transient condition, or an observer error. A pattern across
independent occasions is different in kind, not degree.

So promotion has a **threshold**: at least two independent notes, from separate
sessions, sharing a cause. Below the threshold a note simply stays in the log,
where it costs nothing and waits to be confirmed or forgotten.

This is also what makes cheap capture affordable. Because nothing downstream
happens until recurrence, a note that is wrong, duplicated, or trivial is not a
problem — it is inventory that never gets picked up.

## From note to finding

A **finding** is a promoted, curated claim: a named pattern, the notes that
evidence it, the change proposed, and a status. Promotion is a deliberate batch
act, never something done while the underlying work is in progress.

Deduplication belongs here, not at capture time. Asking an observer to check
whether an incident has already been reported means reading a growing index on
every append — expensive, and less reliable as the index grows. Instead, notes
carry a mechanical key so exact repeats collapse for free, and near-duplicates
are merged during triage, where reading everything at once is cheap.

## What closure means

A finding closes when the change is **verified to have worked** — not when it is
implemented. This distinction is the whole point of a closed-loop system: the
loop opens on a report and closes only after a corrective action has been
confirmed effective.[^fracas]

The practical form: after the change lands, the subject that produced the finding
should stop producing that class of note. If it keeps appearing, the finding is
not closed regardless of what shipped.

| Status | Meaning |
| --- | --- |
| `open` | Recorded, below threshold or not yet triaged |
| `promoted` | Recurrence confirmed, change proposed |
| `applied` | Change landed, effect not yet observed |
| `closed` | Change landed and the class of note stopped appearing |
| `dropped` | Not worth acting on; recorded so it is not re-litigated |

`dropped` matters more than it looks. Without it, rejected observations return
every review cycle and the backlog never converges.

## Three ways this fails

**The write-only store.** Reports accumulate; nobody reads them. NASA's
lessons-learned system was consulted so rarely that most centers stopped
contributing for years, despite formal requirements to use it — the diagnosed
cause was that the store was unsearchable, not that reports were
missing.[^nasa-llis] *Counter:* keep findings small and indexed, and make triage
a scheduled act rather than an aspiration.

**Overload.** When everything is escalated, queues grow, lead times stretch, and
investigation goes shallow.[^capa-riptide] *Counter:* the recurrence threshold,
and a willingness to mark things `dropped`.

**Silence.** Reporting stops when it is costly or risky. Over a quarter of
surveyed workers in one industry study cited reporting systems that were too
complex or time-consuming.[^near-miss-barriers] *Counter:* one small file,
appended, no approval, no interruption to the work in progress.

For observers that never tire and never fear consequences, the third failure mode
largely disappears and the second becomes dominant. Design effort should go to
triage and closure, not to encouraging capture.

## Batch the small things

Individually trivial friction is worth fixing in bounded rounds rather than one
item at a time. The Ubuntu paper-cuts campaigns defined a target class — a
usability defect fixable in about a day — and worked it in explicit rounds
against a release.[^ubuntu-papercuts] The framing does real work: it makes small,
individually ignorable problems collectively legible, and gives the effort an
end.

[^fracas]: *Failure reporting, analysis, and corrective action system*.
[^nasa-llis]: *NASA knowledge management database used rarely*.
[^capa-riptide]: *Caught in a CAPA Riptide?*
[^near-miss-barriers]: *Near-Miss Reporting — The Missing Link of Safety Culture*.
[^ubuntu-papercuts]: *Paper cut bug* — Ubuntu One Hundred Paper Cuts.
