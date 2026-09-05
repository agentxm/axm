---
type: Guide
title: Triaging Defect Reports
description: Use when one or more Defect Reports need evidence-backed classification, relationship decisions, and a next route without invented diagnosis or priority.
tags: [defect-report, triage, duplicate, applicability, investigation, disposition, batch]
generated: { by: codex/gpt-5.6, at: 2026-08-29T19:30:08Z }
---

# Triaging Defect Reports

Triage decides the report's current classification, relationships, and next
route from available evidence. It does not automatically diagnose root cause,
set priority, authorize correction, or close the item.

## Triage one report

1. Bind the exact report and urgent escalation policy.
2. Reopen the material sources and current host state.
3. Assess whether the expectation and discrepancy are applicable to the stated
   version, environment, configuration, and supported use.
4. Compare related reports by source occurrence, symptoms, conditions, impact,
   and evidence; do not merge from title similarity alone.
5. Classify current understanding honestly: insufficient evidence, plausible
   discrepancy, established Defect, expected behavior, environmental or data
   issue, documentation issue, or another locally supported conclusion.
6. Record the next route, deciding authority, rationale, review trigger, and
   any blocked action.

When a material question controls classification or disposition, route it to
bounded investigation. When an established Defect has an authorized remedial
purpose, create or link a separate Change classified as Bugfix.

## Triage a batch

Preserve item-local evidence and outcomes. A repeated pattern may justify a
shared relationship or canonical duplicate decision, but it does not erase
individual occurrences. Continue past item-local failures when safe, then
report each successful, failed, skipped, and unverified identity. Never claim
that a partial tracker mutation was atomic.

Read back every external change. Triage is complete when each in-scope report
has an attributable current classification or explicit unknown, relationship
decisions, and a next route consistent with its evidence.
