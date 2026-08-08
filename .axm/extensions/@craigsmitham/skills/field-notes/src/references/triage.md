# Notes: triage, close, prune

Read
`.axm/extensions/@craigsmitham/knowledge/field-notes/src/closure-explainer.md`
first.

## Triage

Run on a cadence, or when the user asks what has been accumulating. Never run it
inline during other work.

### 1. Collect

Read every note with `status: open`, grouped by subject. Notes are
`field-notes/<subject>/<YYYY-MM-DD>-<key>.md`.

### 2. Collapse exact repeats

Notes sharing a `key` are the same incident recurring. Count them; keep the
earliest as the representative. This is mechanical — do it before any judgment.

### 3. Cluster by cause

Group the remainder by **why** they happened, not by where they surfaced. Two
notes from different commands with the same root cause are one pattern. Two
notes from the same command with different causes are two.

The `**Gap:**` line is the field to cluster on. If a note's gap line is empty or
restates the symptom, treat it as weak evidence and say so rather than counting
it toward a threshold.

### 4. Apply the threshold

A cluster is promotable at **two or more notes from separate sessions**. Check
the dates and evidence — two notes written in one session are one occurrence.

Below threshold: leave open. Do not promote a compelling singleton; the
threshold is what keeps capture cheap and the backlog convergent. Say how many
singletons are being held.

### 5. Promote

Write `field-notes/findings/<key>.md`:

```markdown
---
finding: <slug>
subject: <subject key>
status: promoted
notes: [<note key>, <note key>]
date: <YYYY-MM-DD>
---

**Pattern:** what recurs, in one sentence
**Cause:** why it recurs
**Change:** the smallest durable change that would stop it
**Verify by:** the observation that would confirm it worked
```

`Verify by` is not optional. A finding without it cannot be closed, only
abandoned.

Then set the contributing notes to `status: promoted`.

### 6. Drop what will not be acted on

Mark `status: dropped` with a one-line reason. Dropping is a real outcome and
recording it is what stops the same observation returning every cycle.

Drop when: the note describes a transient condition, the cost of the change
clearly exceeds the friction, or the behavior is intended and the note reflects
a documentation gap already covered elsewhere.

## Close

A finding closes when the change is **verified to have worked**, not when it
ships.

1. Confirm the change landed.
2. Check whether the subject has produced new notes of that class since. If it
   has, the finding is not closed — set it back to `promoted` and say why.
3. If the class stopped appearing, set `status: closed` with the date.
4. If the subject's target condition now holds, consider retirement
   (`references/subjects.md`).

Between landing and confirmation, a finding is `applied`. Do not skip that
state — it is where changes that looked right and did nothing get caught.

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
