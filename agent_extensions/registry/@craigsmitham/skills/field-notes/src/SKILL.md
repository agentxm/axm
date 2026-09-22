---
name: field-notes
description: >
  Records a concise field note for meaningful friction already encountered in
  an agent session. Use when the field-notes rule requests capture or the user
  asks to log a failure, confusing instruction, avoidable rework, missing
  capability, or workaround. Not for investigating causes, recommending
  improvements, reviewing accumulated notes, or managing their lifecycle.
---

# field-notes

Preserve one concrete occurrence of session friction for later analysis, then
continue the original task.

## Capture boundary

Capture friction that was encountered while doing the task, including:

- an unexpected failure or blocked step;
- confusing, missing, or contradictory guidance;
- an avoidable retry, repeated read, manual step, or other rework;
- a missing capability that affected progress; or
- a workaround required to continue, even when it succeeded.

Do not capture routine work, an expected diagnostic failure, an isolated typing
mistake, a general impression, or a speculative concern without an observed
occurrence. Combine the retries and recovery for one incident into one note.

Use only facts, evidence, measurements, and context already available from the
task. Do not run tools, investigate, analyze causes, interpret evidence, or
develop recommendations to enrich the note. Missing information stays missing.
If a constraint, explanation, or possible remedy was already established during
the task, it may be retained as existing context with its uncertainty intact.

Capture does not authorize remediation, broader investigation, external
communication, or any other new side effect.

## Record the occurrence

Read `references/capture.md` and write one new note at:

`field-notes/<YYYY-MM-DD>T<HHMMSS>Z-<nonce>-<short-description>.md`

Use UTC and a short lowercase alphanumeric nonce. Use an opaque runtime session
ID when one exists. Otherwise generate a short opaque ID on the first note and
reuse it for later notes in the same session; use `unknown` when establishing an
ID would require investigation.

Write the note when the immediate outcome is known. Keep it brief, omit optional
material that adds no value, protect secrets and sensitive values, and never edit
an earlier note to record a later occurrence.

The write completes capture. Do not reread or verify the note, inspect repository
status, or run any other post-write check for it.

Continue the original task immediately after writing. Mention captured notes in
at most one short line at the end of the user response.
