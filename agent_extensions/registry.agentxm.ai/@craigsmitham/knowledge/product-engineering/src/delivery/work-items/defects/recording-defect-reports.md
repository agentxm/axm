---
type: Guide
title: Recording Defect Reports
description: Use when an observation or concern may indicate a Defect and needs an actionable, evidence-preserving work item.
tags: [defect-report, bug-report, recording, discrepancy, reproduction, impact, workaround, pe-delivery]
generated: { by: claude/opus-5, at: 2026-09-08T00:00:00Z }
---

# Recording Defect Reports

Record what was observed and under which conditions. Do not assert a cause, a
correction, or a priority that the available evidence does not support; see
[Defects and Defect Reports](defects-and-defect-reports.md) for the
distinctions this workflow preserves.

## 1. Choose the record and channel

Use one Defect Report for one independently managed discrepancy. Preserve
separate source occurrences when they may share a cause but still need
independent impact, evidence, communication, or closure. Use a governed private
channel for sensitive security, privacy, safety, or customer evidence and keep
only a safe synopsis in a public report.

## 2. Establish the discrepancy

Record:

- the affected behavior, artifact, service, data, or documentation;
- the applicable expectation or intended use and its source;
- the observed result;
- the environment, revision, inputs, state, and triggering conditions; and
- what remains unknown about applicability, cause, or extent.

Do not invent an expectation merely to make the report look complete.

## 3. Make evidence actionable

Include the smallest safe evidence that helps another person observe,
distinguish, or investigate the discrepancy. Reproduction steps are valuable
when known and safe, but are not universally required. Preserve logs,
screenshots, measurements, static findings, correlation identifiers, and
unavailable evidence with their provenance and limitations.

## 4. Describe impact and workaround

State observed or credibly reported consequences, affected users or workflows,
frequency only when supported, and any workaround with its limits and risks.
Keep severity and priority as separately authorized host metadata.

## 5. Preserve understanding and next action

Separate confirmed findings from hypotheses. Record investigation state,
related occurrences or incidents, and the next authorized route: request more
evidence, investigate, classify, link a corrective Change, defer, monitor, or
close under local policy.

Derive the title and summary last. Apply the complete [Defect Report
template](defect-report-template.md) only when native host fields cannot carry
the meaning.
