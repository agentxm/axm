# Review result

Return an exception-based result that lets a reader see the decision and act
before reading supporting evidence. The checklists guide assessment; do not
dump completed checklist items into the result.

Use these review dispositions:

- `SUPPORTED` — evidence supports the claim for the inspected scope;
- `ACTION REQUIRED` — a supported finding requires resolution;
- `UNKNOWN` — material evidence is missing, conflicting, stale, skipped, or
  unavailable; and
- `NOT APPLICABLE` — the claim does not apply to the bounded subject.

Evaluation Results retain their own `pass`, `fail`, and `unknown` outcomes.
Do not substitute those outcomes for review dispositions.

## Result shape

```markdown
# Review: <Change and subject>

## Decision

- Mode: <checkpoint | final>
- Focus: <architecture | requirements | evaluations | implementation | integrated>
- Disposition or recommendation: <one allowed value>
- Release readiness: <not assessed | ready | not ready | not established>
- Basis: <one or two sentences>
- Blocking findings: <IDs or none>
- Material unknowns: <IDs or none>

## Required actions

| Priority | Owner | Required outcome | Done when | Finding |
| ---: | --- | --- | --- | --- |

## Findings

### F-1 — <severity> — <actionable title>

- Affects: <exact authority or candidate revision and location>
- Problem: <violated expectation or risk>
- Consequence: <why it matters>
- Evidence and confidence: <concise evidence and confidence>
- Required outcome: <resolution without unnecessary implementation prescription>
- Route: <spec | design | plan | implement | investigate | evaluation owner>

## Assurance summary

| Area | Status | Key conclusion | Findings or unknowns |
| --- | --- | --- | --- |
| Requirement satisfaction | <status> | <one line> | <IDs or —> |
| Architecture realization | <status> | <one line> | <IDs or —> |
| Semantic evaluation quality | <status> | <one line> | <IDs or —> |
| Implementation quality | <status> | <one line> | <IDs or —> |
| Whole-change integrity | <status> | <one line> | <IDs or —> |

## Material unknowns

### U-1 — <title>

- Missing evidence: <what is unavailable>
- Prevents conclusion about: <bounded claim>
- Evidence needed: <specific artifact or check>
- Owner: <responsible owner>

## Review boundary

- Subject: <exact immutable revision or diff>
- Compared with: <exact accepted authorities and artifact revisions>
- Included: <scope>
- Excluded: <scope>
- Checks performed: <concise list or evidence links>
- Prior review evidence consulted: <identities or none>
```

Omit empty finding and unknown bodies, but never omit a material claim merely
because no problem was found. Keep the assurance summary compact.

For checkpoint mode, use one disposition:

- `continue`;
- `implementation-revision-required`;
- `definition-reconciliation-required`;
- `more-evidence-required`; or
- `unable-to-assess`.

For final mode, use one recommendation:

- `ready-for-release-decision`;
- `implementation-revision-required`;
- `definition-reconciliation-required`;
- `more-evidence-required`; or
- `unable-to-assess`.

A checkpoint never establishes release readiness. A final recommendation is
not a release decision.
