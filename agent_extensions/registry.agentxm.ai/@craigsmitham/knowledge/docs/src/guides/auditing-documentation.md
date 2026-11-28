---
type: Reference
title: Documentation audit report contract
description: Defines the scope, coverage, ordered finding fields, and report structure for a bounded documentation audit.
tags: [docs, audit, assessment, inventory, sampling, evidence, findings, quality]
status: stable
sources:
  - id: documentation-audits
    resource: ../explainers/documentation-audits.md
    title: Documentation audits
generated: { by: codex/gpt-6, at: 2026-11-22T00:10:36Z }
---

# Documentation audit report contract

Use this contract to present the results of a bounded documentation audit.
Choose the assessment dimensions and evidence that answer the audit
question.[^documentation-audits]

## Scope and coverage

Identify the audit question, included and excluded scope, audiences, applicable
authority, revision/release or observation time, and evidence-access limits.
Declare a path census, full bounded review, purposeful sample, journey sample,
or combination; record the population, selection, reviewed items, and blind
spots. Separate deterministic checks from judgment, and unverified claims from
incorrect claims. A sample does not establish corpus-wide prevalence.

## Findings

Use this exact field order for each material finding; do not fold fields together:

- `<ID> — <title>`
- `Severity:` — consequence if unchanged
- `Confidence:` — strength and coverage of evidence
- `Condition:` — observed state
- `Evidence:` — paths, observations, commands, or sources
- `Impact:` — affected reader, maintainer, or obligation
- `Expected state:` — applicable criterion or desired condition
- `Recommendation:` — proportionate next action
- `Route:` — authoring, organization, domain verification, tooling, or owner

Group instances explained by one condition; separate different causes, owners,
or remedies. Use plain severity labels whose meanings are stated in the report.
A useful default is:

| Severity | Meaning |
| --- | --- |
| Critical | Likely to cause serious harm, unsafe action, or widespread inability to carry out the documented work |
| High | Blocks an important reader journey or materially misrepresents the subject |
| Medium | Creates recurring confusion, inconsistency, or maintenance cost without broadly blocking use |
| Low | Localized friction or a bounded quality defect with a straightforward workaround |


## Report order

1. **Scope and snapshot**
2. **Overall disposition**
3. **Coverage and method**
4. **Strengths to preserve**
5. **Findings**, ordered by severity and then remediation dependency
6. **Recommended remediation order**
7. **Limitations and unresolved evidence**
8. **Handoff**

Useful dispositions are **sound within audited scope**, **targeted remediation**,
**structural remediation**, and **insufficient evidence**. A disposition does
not replace findings; a numeric score must not collapse unlike qualities.

Audit-only work ends with the report. For requested remediation, retain the
finding set so changes remain traceable to evidence and authorized scope.

[^documentation-audits]: [Documentation audits](../explainers/documentation-audits.md).
