---
type: Explanation
title: Defects and Defect Reports
description: Explains how observations, failures, defects, reports, investigation, correction, verification, and closure remain distinct.
tags: [defect, defect-report, bug, failure, observation, expectation, diagnosis, correction, verification]
generated: { by: codex/gpt-5.6, at: 2026-08-29T19:30:08Z }
---

# Defects and Defect Reports

An **observation** records something perceived under stated conditions. A
**failure** is an observed inability to perform as required or intended. A
**Defect** is a deficiency in a system or work product relative to an
applicable expectation or intended use. A **Defect Report** is the durable work
item that preserves evidence suggesting one or more Defects may exist.

These concepts do not imply one another automatically. An anomaly may have a
valid explanation. A static finding may establish a Defect without a witnessed
runtime failure. One failure may result from several Defects, and one Defect may
produce several occurrences.

## Expectation and discrepancy

A useful report identifies the relevant expectation or intended use and the
observed discrepancy. The expectation may come from a specification, contract,
decision, policy, documented behavior, supported use, or other recognized
source. If it is uncertain, record the candidate expectation and its authority
rather than manufacturing a definitive requirement.

## Report maturity

The report may mature from received concern, through supported discrepancy and
investigation, to an authorized disposition. That maturity is separate from
priority, assignment, correction, verification, and closure. A tracker label
such as `bug` cannot prove diagnosis.

## Correction and closure

Investigation reduces uncertainty. Correction changes a defective work product
or compensates for an unacceptable effect. Verification gathers bounded
evidence about stated conditions. Closure records an authorized lifecycle
decision. A report can be closed as duplicate, not reproducible under stated
conditions, accepted risk, out of scope, or remediated; those dispositions have
different meanings and evidence needs.

When correction is authorized, preserve the Defect Report and create or link a
separate [Change](../changes/changes.md) classified as Bugfix. This keeps the
observation history intact while the Change coordinates the intended
modification.
