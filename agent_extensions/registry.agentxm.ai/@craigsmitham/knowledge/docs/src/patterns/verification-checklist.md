---
type: Pattern
title: Verification checklist
description: When completed work may contain omissions or incorrect states, compare observable evidence with explicit criteria and route discrepancies to correction or escalation.
tags: [docs, documentation-pattern, checklist, verification, do-confirm, challenge-response, evidence, authoring]
status: draft
sources:
- id: checklist-design-origin
  resource: https://github.com/craigsmitham/agent-extensions/blob/156c3d4346bee6874ab3d356c19446cf6425713b/skills/checklist-design/src/references/interaction-and-item-design.md
  title: Craig Smitham — Interaction and item design, version 0.1.10
- id: nasa-checklists
  resource: https://www.faa.gov/sites/faa.gov/files/2022-11/NASA%20Ames%20Rpt%20CR%20177549%20.pdf
  title: Degani and Wiener — Human Factors of Flight-Deck Checklists
generated:
  by: codex/gpt-6
  at: '2026-11-11T17:40:43Z'
---

# Verification checklist

When completed work may contain omissions or incorrect states, **compare
observable evidence with explicit criteria and route discrepancies to correction
or escalation**.

## Problem and design response

Remembering an action or seeing a completion mark does not establish the
resulting state. A verification checklist directs attention to evidence after
work has been performed. This commonly uses do-confirm interaction. A team can
use challenge-response to make observations shared and discrepancies audible.

NASA describes checking an initial configuration and mutual verification by
crew members. It distinguishes the configuration activity from the subsequent
check.[^nasa-checklists] This supports the separation here, without making
team participation or a second checker mandatory for every application.

## How to write it

1. Identify the work, version, or state under review and when checking is useful.
2. Describe the expected observable condition. Name the authoritative criterion
   or limit and where evidence can be found.
3. Require an actual value, artifact, or observation where a yes/no answer would
   conceal a discrepancy. Distinguish unknown from a verified match.
4. Identify the verifier and the intended independence. A self-check may be
   useful, but it is not an independent check. Two people relying on the same
   unchecked assertion do not create independent evidence.
5. Give failures a disposition: correct, recheck, record an accepted exception,
   or escalate to the authorized role. Define what changes invalidate a check.

The shared [Checklist](checklist.md) pattern supplies use-protocol, medium,
validation, and lifecycle guidance. A verification result can supply evidence
to a [readiness checklist](readiness-checklist.md); the latter owns the decision
to proceed, rather than making every observation an implicit approval.

## Applicability and tradeoffs

Use this pattern when the relevant state is observable and checking can still
change the outcome. Use an [execution checklist](execution-checklist.md) to
prompt actions not yet performed. Use a rubric or expert review when the
question requires interpreting open-ended quality rather than checking known
conditions. Automate repeatable checks when that gives more dependable feedback.

Verification consumes time and can duplicate other controls. It can also find
errors the performer missed. Independence, evidence freshness, and correction
paths determine its value more than the number of signatures. Repeated checks
without new evidence can produce ritual assent and diffuse responsibility.

## Illustrative realizations

A publishing reviewer might compare links in the rendered artifact with their
intended destinations. A data-transfer reviewer might compare the recorded
source and destination totals using the approved reconciliation rule. Both
inspect resulting evidence; neither merely asks whether someone remembers
running a command. Their criteria and acceptable discrepancies differ.

These are synthetic examples. “The document is good” without a criterion is
not an equivalent verification item, and agreement on such a statement does
not make it one.

## Review and evidence

Evaluate missed defects, false alarms, interpretation differences, correction,
and escaped errors against current practice. Check whether evidence refers to
the intended version and remains current after changes. Completion without
inspection, or agreement without detection of material defects, challenges the
claimed verification mechanism.

This draft carries forward the earlier item-design guidance.[^checklist-design-origin]
It is a design synthesis, not evidence of local reliability or certification.

[^checklist-design-origin]: Craig Smitham — Interaction and item design, version 0.1.10.
[^nasa-checklists]: Degani and Wiener — Human Factors of Flight-Deck Checklists.
