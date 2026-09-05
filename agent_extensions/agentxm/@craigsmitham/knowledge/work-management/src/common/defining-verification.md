---
type: Guide
title: Defining work-item verification
description: Use when a work item needs observable completion conditions, an evidence strategy, or a bounded verification result.
tags: [work-item, verification, acceptance-criteria, evidence, result, environment, revision]
generated: { by: codex/gpt-5.6, at: 2026-08-29T19:30:08Z }
---

# Defining work-item verification

Verification is a bounded evidence claim, not a synonym for delivery or
closure.

## Define the claim

State observable conditions for the relevant outcome or completion boundary.
Name the subject, applicable revision or state, material environment and inputs,
and any time or observation window. Avoid conditions that merely repeat an
implementation task or require an unobservable judgment such as “works well.”

## Select an evidence strategy

Describe how the conditions can be assessed: automated tests, inspection,
analysis, measurement, review, simulation, operational observation, or another
method. Preserve limitations and any conditions the method cannot observe.

## Record the result separately

A result states what one bounded execution or observation established. Record
the method, exact revision, environment, inputs, material observations, outcome,
and uncertainty. Planned verification is not a result; a passing result does
not automatically generalize to another revision or context.

## Relate verification to closure

Local policy decides which results are sufficient for closure and who can make
that decision. Keep residual risk, unassessed conditions, skipped evidence, and
follow-up visible. Use **unknown** when evidence cannot decide; do not turn
missing evidence into a pass.
