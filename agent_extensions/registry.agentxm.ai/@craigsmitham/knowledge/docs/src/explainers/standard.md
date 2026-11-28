---
type: Explainer
title: Standard
description: How a shared standard lets people interpret one another’s work, what variation it allows, and why meeting it can leave questions of quality open.
tags: [docs, standard, standardization, criteria, quality, judgment, authority, normative, explainer]
status: stable
sources:
  - id: iso-definitions
    resource: https://policy.iso.org/resources.html
    title: ISO — Useful definitions
  - id: timestamps
    resource: https://www.rfc-editor.org/rfc/rfc3339.txt
    title: RFC 3339 — Date and Time on the Internet, §§4.2, 4.4 and 5.6
generated: { by: "codex/gpt-6", at: "2026-11-22T01:49:36Z" }
---

# Standard

How can people working independently judge their work against the same
expectations? A **standard** gives them a recognized, reusable basis for
judging what is acceptable, fitting, or excellent in a particular field.
Its criteria help people compare results, specify requirements, or make
their work fit together without settling those expectations anew each time.

Suppose two dispatchers keep logs for the same delivery. One records a
departure at 09:00 and the other records an arrival at 08:30 on the same
date. Read as times on the same clock, the entries put the arrival first.
A dispatcher on the departure desk may know perfectly well which clock
the entry refers to. A colleague comparing the two logs lacks just that
piece of knowledge.

## What the two desks need to agree on

RFC 3339 specifies a timestamp for use by Internet protocols. It gives the
date in year, month, day order and states how the time relates to Coordinated
Universal Time (UTC). Written in that form, the entries might be
`2025-05-06T09:00:00+02:00` and `2025-05-06T08:30:00Z`. The first clock
reads two hours ahead of UTC, so the departure was at 07:00 UTC. The
`Z` on the second entry puts the arrival at 08:30 UTC. Anyone who knows
the convention can recover the hour and a half between the recorded times
without knowing either dispatcher.[^timestamps]

The desks could have recorded both events in UTC and obtained the same
result. They can display times to staff differently and store them in
different databases. What needs agreement is the meaning of what they
exchange. A shared format leaves those other decisions to the people best
placed to make them. It also leaves open whether someone read the clock
correctly. A perfectly formed timestamp can record the wrong departure.

## Why “standard” can mean different things

In speaking of someone's “high standards,” a colleague may have in mind
an exemplary dispatch log whose entries make an entire journey easy to
reconstruct. People can learn that standard of good work by comparing
their logs with the exemplar. A documentary standard makes selected
expectations public and precise enough for strangers to use. ISO's
definition of a standard specifically concerns a document approved by a
recognized body through consensus for common and repeated use.[^iso-definitions]
The published timestamp format can travel much further than the
dispatcher who first taught someone to keep a clear log.

The kind of agreement depends on the problem. A terminology standard may
give both desks the same meaning for *departure*. A measurement standard
can settle where and how to take the reading. A performance requirement
can leave room for different methods. A prescribed design can matter when
independently produced parts have to fit together. With a shared interface
like the timestamp, two teams can do equally good work with quite
different implementations.[^timestamps]

The force of the expectation matters too. A minimum allows a pass or
fail decision. A target gives a team something to aim for, while a scale can distinguish
degrees of performance above a minimum. A baseline
makes change visible, even when the change is desirable. Treating last
month's usual delivery time as a required maximum would turn a useful
comparison into a promise nobody had made.

## What makes the document useful in a practice

A [practice](practice.md) gives the provisions their setting. The desks
might agree on a time format and still disagree on whether “departed”
means that loading ended or that the vehicle left the yard. Comparing
real entries brings that ambiguity to light. The team now has a reason
to clarify a definition, and the next dispatcher can inherit what the
team learned.

Someone implementing the exchange needs to look up the exact format.
Someone investigating the apparently reversed journey needs the reasoning
behind it. An example timestamp can serve both readers, but the rule
that governs their exchange lives in the provision defining the format.
Changing the date in an illustration leaves the rule intact.[^timestamps]
Which agreement makes a standard binding for a particular project, and
what evidence supports a claim to have met it? Those questions belong to
[Standard authority and conformance](standard-authority-and-conformance.md).

[^iso-definitions]: ISO, [Useful definitions](https://policy.iso.org/resources.html), drawing on ISO/IEC Guide 2:2004.
[^timestamps]: [RFC 3339 — Date and Time on the Internet, §§4.2, 4.4 and 5.6](https://www.rfc-editor.org/rfc/rfc3339.txt).
