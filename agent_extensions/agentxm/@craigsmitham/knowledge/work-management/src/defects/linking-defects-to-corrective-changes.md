---
type: Guide
title: Linking Defects to corrective Changes
description: Use when established defects and an authorized remedial purpose must remain traceable to a separate Change classified as Bugfix.
tags: [defect, defect-report, change, bugfix, remediation, correction, regression]
generated: { by: codex/gpt-5.6, at: 2026-08-29T19:30:08Z }
---

# Linking Defects to corrective Changes

Classify a Change as **Bugfix** only when available evidence establishes a
Defect and the Change has an authorized purpose to correct it or acceptably
compensate for its unacceptable effect. Investigation, monitoring, risk
acceptance, or deferment alone is not a Bugfix.

## Preserve separate identities

Keep every originating Defect Report as an independently recoverable evidence
record. Link the Change to the reports or established Defects it remediates and
state the relationship direction. Do not merge reports into the Change or
rewrite the report as an implementation proposal.

## Define the corrective outcome

State which discrepancy or unacceptable effect the Change addresses, the
expected corrected or compensated condition, included and excluded cases,
constraints, regression risks, and observable acceptance conditions. Link the
applicable expectation rather than copying it into a competing statement.

Mixed work may remain one Change only when it has one coherent outcome,
authority, delivery path, and verification boundary. Split unrelated
improvement or maintenance work when it can proceed or close independently.

## Verify and disposition independently

The Change records delivery and verification for the correction. Each source
Defect Report follows its own local disposition and closure policy. A delivered
Bugfix does not automatically verify or close every report, and a closed report
does not prove that the Change was delivered.
