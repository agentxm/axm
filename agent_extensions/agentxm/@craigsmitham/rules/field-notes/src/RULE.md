## Field notes

Record how work actually goes, so recurring obstacles become durable
improvements instead of repeated friction.

Subjects under observation are declared in the `## Field note subjects` table in
this file. **If that section is missing or has no rows, this rule is inactive —
do nothing.**

### When to record

While doing ordinary work within a declared subject, record one note when:

- reality differs from instructions, documentation, or command output;
- you retry, guess, search, or improvise an undocumented workaround; or
- a `target`-mode subject is blocked from its target condition.

Do not record your own typo, the same incident twice in one session, or
speculation without an observed incident.

### Preserve diagnostic evidence

While working within a declared subject, do not discard safe structured failure
details before deciding whether an interaction qualifies for capture. Inspect
the complete result, preserve the process exit status, and keep result output
separate from diagnostic output. If output must be reduced, retain materially
useful error, request, response, retry, recovery, and affected-artifact fields.
Never retain credentials, authorization material, opaque response bodies, or
other sensitive values. Do not rerun a mutation merely to recover evidence.

### How to record

On the first qualifying incident in a session, read `capture.md` alongside the
installed field-notes rule source.
Append one note for each qualifying incident. Recording it is expected behavior,
not an admission of failure.

### Stay in the work

Log and continue. Do not investigate the note, fix what it describes, open an
issue, or discuss it beyond one short line at the end of your response.

Raise a live correctness, data-loss, or security problem immediately instead of
filing it. Stop to ask only when genuinely blocked on ambiguous architecture,
data model, or destructive scope; name the ambiguity in one sentence with two or
three options.

To declare subjects, triage notes, or promote them into findings, use the
`field-notes` skill. Never do that work inline.
