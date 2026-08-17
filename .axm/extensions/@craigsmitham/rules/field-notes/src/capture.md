# Capture a field note

Write one new file per incident. Never edit an existing note: a second
occurrence is a second file, and that recurrence is the signal.

Use
`field-notes/<subject>/<YYYY-MM-DD>T<HHMMSS>Z-<nonce>-<key>.md`, where
`<nonce>` is a short lowercase alphanumeric value and `<key>` is a candidate
pattern slug for the surface and symptom. Use UTC and a different root if the
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
kind: gap | workaround | blocked
status: open
---

**Expected:** what should have happened, and what led you to expect it
**Observed:** what happened instead
**Impact:** the observed consequence and direct cost to this work
**Recovery:** what restored progress and whether the task completed
**Detected by:** how the difference became visible
**Observed factors:** relevant conditions directly seen during the incident
**Hypothesis:** a tentative explanation, or `unknown`
**Suggests:** an optional reporter idea; omit when none is grounded

Evidence: the minimum observable facts needed to verify, interpret, and compare
the incident. Include material context that could change the outcome; mark an
unavailable material fact as unknown rather than inferring it.
```

Report one specific incident with observable evidence. Do not substitute a
general impression. Keep capture brief and continue the original work; do not
investigate to fill a field.

For `Impact`, say what was delayed, degraded, repeated, or prevented and who or
what was affected. Quantify directly observed retries, extra steps, elapsed
time, rework, or unusable output when known; write `not measured` rather than
estimating. Do not assign a severity score or predict frequency, reach, or
hypothetical harm.

`Observed factors` contains facts, not causal claims. `Hypothesis` and
`Suggests` are explicitly provisional and must never be presented as an
established cause or approved change. Use `none observed`, `unknown`, or omit
the optional suggestion instead of guessing.
