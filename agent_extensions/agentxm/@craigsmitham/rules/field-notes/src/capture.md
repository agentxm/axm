# Capture a field note

Write one new file per occurrence. Never edit an existing note: a second
occurrence is a second file, and that recurrence is the signal.

Use
`field-notes/<subject>/<YYYY-MM-DD>T<HHMMSS>Z-<nonce>-<key>.md`, where
`<nonce>` is a short lowercase alphanumeric value and `<key>` is a candidate
pattern slug for the surface and observation. Use UTC and a different root if the
subjects table names one. The timestamp and nonce identify this occurrence;
the key does not.

Use an opaque runtime session ID when one exists. Otherwise generate a short
opaque ID on the first note and reuse it for every note in this session. Use
`unknown` only when session identity cannot be established without
investigation.

```markdown
---
id: <YYYY-MM-DD>T<HHMMSS>Z-<nonce>
subject: <subject key>
key: <slug>
observed_at: "<ISO-8601 UTC timestamp>"
session: <opaque session ID | unknown>
kind: observation | gap | workaround | blocked
status: open
---

**Expected:** what you expected and why; use `none` for an unanticipated discovery
**Observed:** what actually happened, including relevant first-attempt behavior
**Impact:** the observed consequence for this work, including benefits or costs
**Outcome:** how the attempt or task ended
**Recovery:** what restored progress, or `not needed`
**Detected by:** how the observation became visible
**Observed factors:** relevant conditions directly seen during the occurrence
**Diagnostic evidence:** safe identifiers and structured result fields already
available from the occurrence; omit when the occurrence was not machine-surfaced
**Hypothesis:** a tentative explanation, or `unknown`
**Suggests:** an optional reporter idea; omit when none is grounded

Evidence: the minimum observable facts needed to verify, interpret, and compare
the occurrence. Include material context that could change the outcome; mark an
unavailable material fact as unknown rather than inferring it.
```

Report one specific occurrence with observable evidence. Use `observation` for
useful feedback that is not a gap, workaround, or blocker. Do not substitute a
general impression. Keep capture brief and continue the original work; do not
investigate to fill a field.

For a machine-surfaced occurrence, inspect the complete structured result before
reducing it and preserve the process exit status. Keep primary result output
separate from diagnostic output, and ensure a pipeline does not replace the
original command's status with a successful formatter status.

Record only already-observed, materially useful diagnostic fields, such as:

- tool version, command surface, and affected artifact identity and version;
- stable error code or class, request or correlation ID, response status, and
  problem code;
- retryability, attempt count, replay safety, and retry stop reason;
- safe recovery command, remaining and blocked identities, candidate identity,
  or archive integrity.

Use `not supplied` when the authoritative result omitted an expected field.
Use `unavailable — output was not retained` when the workflow discarded it.
Do not infer either state, rerun a mutation to fill the note, or investigate for
additional fields. Never record credentials, tokens, authorization headers,
opaque response bodies, or unreviewed values that may contain sensitive data.

For `Impact`, say what changed for the work and who or what was affected,
whether the result was beneficial, adverse, or neutral. Quantify directly
observed benefits, retries, extra steps, elapsed time, rework, or unusable output
when known; write `not measured` rather than
estimating. Do not assign a severity score or predict frequency, reach, or
hypothetical harm.

`Observed factors` contains facts, not causal claims. `Hypothesis` and
`Suggests` are explicitly provisional and must never be presented as an
established cause or approved change. Use `none observed`, `unknown`, or omit
the optional suggestion instead of guessing.
