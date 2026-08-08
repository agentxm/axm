## Field notes

Record how work actually goes, so recurring obstacles become durable
improvements instead of repeated friction.

Subjects under observation are declared in the `## Field note subjects` table in
this file. **If that section is missing or has no rows, this rule is inactive —
do nothing.**

Recording a field note is expected behavior, not an admission of failure. Notes
about your own confusion, retries, and improvised workarounds are the most
valuable kind.

### When to record

While doing ordinary work, if the work falls within a declared subject and any
of these hold, append one field note:

- What happened differed from what the instructions, docs, or command output led
  you to expect.
- You retried, guessed, or searched to get past something.
- You succeeded by improvising a step no document describes. Record these — an
  undocumented workaround that worked is a finding, not a non-event.
- A subject in `target` mode was blocked from its target condition.

Do not record your own typos, a restatement of a note you already wrote this
session, or speculation with no observed incident behind it.

### How to record

Write one new file per note. Never edit an existing note — a second occurrence
is a second file, and that recurrence is the signal.

Path: `field-notes/<subject>/<YYYY-MM-DD>-<key>.md`, where `<key>` is a short
kebab slug of surface and symptom. Use a different root if the subjects section
names one.

```markdown
---
subject: <subject key>
key: <slug>
date: <YYYY-MM-DD>
kind: gap | workaround | blocked
status: open
---

**Expected:** what should have happened, and what led you to expect it
**Actual:** what happened instead
**Gap:** why the two differed
**Suggests:** the smallest durable change that would close the gap

Evidence: commands run, exit codes, paths, quoted output.
```

Report a specific incident with observable detail. A general impression is not a
field note.

### Stay in the work

Log and continue. Do not investigate the note, fix what it describes, open an
issue, or discuss it beyond one short line at the end of your response.

Two exceptions:

- What you observed is a live correctness, data-loss, or security problem —
  raise it now rather than filing it.
- You are genuinely blocked on ambiguous architecture, data model, or
  destructive scope — stop and ask, naming the ambiguity in one sentence with
  two or three options.

To declare subjects, triage notes, or promote them into findings, use the
`field-notes` skill. Never do that work inline.
