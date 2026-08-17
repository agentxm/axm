# Notes: triage, close, prune

Read
`.axm/extensions/@craigsmitham/knowledge/field-notes/src/closure-explainer.md`
first.

## Triage

Run on a cadence, or when the user asks what has been accumulating. Never run it
inline during other work.

### 1. Collect

Read every note with `status: open`, grouped by subject. Notes are
`field-notes/<subject>/<occurrence-id>-<key>.md`. Accept legacy date-key names
and legacy bodies without the newer observation fields. For a legacy note, use
its path as its occurrence identity and treat absent evidence as unknown; never
backfill from memory or implication.

### 2. Collapse exact repeats

Treat `key` as a candidate pattern label, not proof that notes are equivalent.
Collapse notes as exact repeats only when their observed behavior and material
conditions match. Count unique occurrence IDs and preserve every contributing
ID; never count two files describing one incident twice.

### 3. Establish independent occurrences

Use the explicit `session` field to establish independence. For legacy or
`unknown` sessions, use dates and evidence only when they prove separate
sessions. When independence is uncertain, count the reports but only one
independent occurrence toward promotion.

### 4. Cluster by observed pattern

Group notes by recurring **observed behavior and material conditions**, even
when they surfaced in different commands or workflows. Do not cluster on
`Hypothesis`, `Suggests`, or the legacy `Gap` field; those are reporter
interpretations. Two similar hypotheses are not corroboration.

For each cluster, distinguish:

- `Pattern`: the recurring observed behavior;
- `Contributing factors`: conditions directly supported across notes;
- `Cause`: an established cause, or `unknown — needs investigation`; and
- `Cause confidence`: `corroborated`, `plausible`, or `weak`.

`corroborated` requires objective or independent evidence beyond repeated
reporter interpretation. `plausible` fits the observations but is not
independently established. `weak` means evidence is missing, conflicting, or
mostly inferential. Unknown cause does not block promotion; it makes
`investigate` the honest proposed action type.

### 5. Check extent and corroboration

Check readily available sources implicated by the notes or supplied by the user,
such as existing issues, tests, logs, support reports, or documentation. Use
them to assess corroboration and the affected surfaces, versions, roles, or
workflows. Do not start broad debugging or infer unobserved reach; record
`unknown` when the extent cannot be established cheaply.

### 6. Build the priority basis

For each cluster, preserve these dimensions separately:

- `Actual impact`: typical and worst observed consequences and comparable
  measured costs;
- `Recurrence`: independent occurrences and exposure or opportunity count when
  established;
- `Extent`: affected surfaces, versions, roles, or workflows actually
  established;
- `Urgency`: evidence that delay changes the cost or consequence, or `none
  known`;
- `Potential consequence`: an evidence-supported plausible outcome beyond what
  occurred, or `not assessed`;
- `Detectability`: `obvious`, `delayed`, `silent`, or `unknown`;
- `Recoverability`: `automatic`, `simple workaround`, `costly workaround`,
  `blocked`, or `unknown`;
- `Evidence confidence`: `corroborated`, `plausible`, or `weak`; and
- `Change cost`: known implementation, migration, maintenance, and regression
  risk, or `unknown`.

Aggregate costs only when their units and evidence are comparable. Keep
incomparable observations separate. A report count is a numerator, not an
incidence rate: write `N occurrences / exposure unknown` unless observed
sessions or opportunities provide a defensible denominator. Keep actual impact,
potential consequence, urgency, and priority distinct. Do not reduce the
dimensions to a severity or risk score.

Finish with `Priority basis`: a short evidence-backed explanation of the
recommended disposition. Do not investigate an unknown change cost during
triage.

### 7. Apply the threshold

A cluster is promotable at **two or more independent occurrences from separate
sessions**. Below threshold, leave it open. Do not promote a compelling
singleton; say how many singletons are held.

### 8. Promote

Write `field-notes/findings/<key>.md`:

```markdown
---
finding: <slug>
subject: <subject key>
status: promoted
decision: proposed
notes: [<occurrence id>, <occurrence id>]
date: <YYYY-MM-DD>
---

**Pattern:** what recurs, in one sentence
**Contributing factors:** conditions supported across the notes
**Cause:** established cause, or `unknown — needs investigation`
**Cause confidence:** corroborated | plausible | weak
**Actual impact:** observed consequences and typical or worst occurrence
**Cost evidence:** comparable measured costs and material unknowns
**Recurrence:** independent occurrences / observed exposure, or `exposure unknown`
**Extent:** affected surfaces, versions, roles, or workflows established
**Urgency:** why delay matters, or `none known`
**Potential consequence:** evidence-supported plausible outcome, or `not assessed`
**Detectability:** obvious | delayed | silent | unknown
**Recoverability:** automatic | simple workaround | costly workaround | blocked | unknown
**Evidence confidence:** corroborated | plausible | weak
**Change:** the smallest durable change that would stop it
**Change cost:** known implementation, migration, maintenance, and regression risk, or `unknown`
**Proposed action type:** investigate | prevent | mitigate | detect | document
**Priority basis:** why this disposition follows from the evidence
**Verify by:** evidence that would confirm effectiveness
**Adverse effects to check:** material regressions to test for, or `none identified`
```

`Verify by` and `Adverse effects to check` are not optional. A finding without
them cannot be closed, only abandoned. Then set contributing notes to
`status: promoted`.

When several clusters qualify, present them in descending decision relevance
using their priority bases. Never present a promoted finding as accepted.

### 9. Surface costly singletons

A singleton remains an open note and is not a finding. Report it separately as
a **costly singleton** when its priority basis shows blocked work, substantial
measured delay or rework, broad observed extent, an evidence-supported serious
potential consequence, or a user-defined threshold. Offer three dispositions:
act on it directly outside field-note triage, keep observing, or drop it.

This is a review lane, not an exception to the recurrence threshold. Do not
promote the singleton or describe it as a recurring pattern.

### 10. Drop what will not continue through field notes

Mark `status: dropped` with a one-line reason. Dropping removes a note from
field-note triage; it does not deny that the incident occurred. Include an
external reference when the user moved a singleton directly into another
workflow.

Drop when: the note describes a transient condition, the change cost clearly
exceeds the friction, the behavior is intended and already documented, or the
user chose another action path. Recording the disposition stops the same note
returning every review cycle.

## Close

A finding closes when the change is **verified to have worked**, not when it
ships.

### Accept and apply

Promotion proposes a change; the user decides. When the user accepts one, add:

```yaml
decision: accepted
decision_date: <YYYY-MM-DD>
owner: <one accountable person or team>
action_type: investigate | prevent | mitigate | detect | document
verify_after: <date, sessions, or opportunities>
```

Do not invent the owner or verification window. When the change lands, set
`status: applied` and add `applied_at`. Keep the finding open until the stated
verification window has elapsed.

### Verify and close

1. Confirm the accepted change landed and the `verify_after` window is
   satisfied.
2. Apply `Verify by` and check every named adverse effect.
3. Check whether the subject produced new notes of that class. If it did, the
   finding is not closed — set it back to `promoted` and say why.
4. If effectiveness is supported, set `status: closed`, add the date, and
   preserve the verification evidence.
5. If the subject's target condition now holds, consider retirement
   (`references/subjects.md`).

## Prune

Keep the open set readable.

- A note whose referenced files no longer exist is stale. Flag it; ask before
  dropping — the deletion may be the fix.
- A note contradicted by a later note on the same key: keep the later one.
- A note under a retired subject: leave it. Retirement is not deletion.

Never delete notes silently, and never bulk-delete. If the open set is
overwhelming, that is a signal the subjects are scoped too broadly — fix the
subjects, do not clear the log.

## Escalating outside the log

If a finding warrants a tracker issue, a documentation change, or a repository
change, propose it and let the user decide. Do not file, commit, or push as part
of triage.

If notes are being promoted into a public repository or an issue tracker, check
them for paths, hostnames, credentials, and quoted output that should not
travel. Evidence captured during real work is exactly where such material shows
up.
