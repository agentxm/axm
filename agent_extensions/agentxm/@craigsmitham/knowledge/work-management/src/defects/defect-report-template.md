---
type: Reference
title: Defect Report template
description: Provides a compact, tracker-neutral body fallback that preserves discrepancy, conditions, evidence, impact, uncertainty, relationships, and next action.
tags: [defect-report, bug-report, template, markdown, fallback]
generated: { by: codex/gpt-5.6, at: 2026-08-29T19:30:08Z }
---

# Defect Report template

Use native host fields for identity, type, status, priority, assignment,
relationships, and timestamps when they carry those facts exactly. Omit any
inapplicable heading from this fallback.

```markdown
# <Affected subject> <observed result> when <condition>

## Summary

<Why this report exists, the affected behavior or artifact, and the observed
discrepancy without asserting an unestablished cause or correction.>

## Discrepancy

- **Expectation or intended use:** <statement and authoritative source, or the
  candidate expectation and its uncertainty>
- **Observed:** <actual result>
- **Conditions:** <environment, revision, inputs, state, and trigger>
- **Impact:** <observed or credibly reported consequence>
- **Workaround:** <known workaround and limitations, if any>

## Evidence and understanding

- **Sources:** <stable identifiers, safe links, times, and provenance>
- **Evidence:** <minimal observations, logs, screenshots, measurements, static
  findings, or unavailable material>
- **Reproduction:** <steps or discriminating conditions, when established and
  safe>
- **Current understanding:** <confirmed findings, hypotheses, and unknowns kept
  distinct>

## Relationships and disposition

- **Related:** <occurrences, incidents, duplicates, Changes, or other evidence>
- **Current disposition:** <classification or explicit unknown, authority, and
  rationale>
- **Verification:** <conditions, strategy, result, and bounded context when
  applicable>
- **Next action:** <owner, next authorized action, and blocker or review trigger>
```
