---
type: Guide
title: Preserving technical context
description: Use when supplied findings, constraints, designs, implementation ideas, test strategy, or tradeoffs must survive transfer into a work item.
tags: [work-item, technical-context, findings, constraints, design, implementation, testing, tradeoffs]
generated: { by: codex/gpt-5.6, at: 2026-08-29T19:30:08Z }
---

# Preserving technical context

Technical context is often the most expensive part of a handoff to
reconstruct.
Preserve what was actually supplied without silently selecting, approving, or
completing it.

## Inventory the source

Identify material findings, constraints, decisions and their state, rejected or
unselected alternatives, diagrams or sketches, proposed implementation
sequence, test strategy, risks, and open questions. Preserve their source and
the revision or conditions under which they were formed.

## Choose a proportional home

- Put short case-specific context directly in the work item.
- Link a stable peer design, decision, benchmark, or test artifact when it
  already owns the detail.
- Preserve a compact attributed synopsis when the source is transient or
  access-controlled.
- Do not turn a Defect Report into the corrective Change or make an unselected
  sketch appear to be the implementation plan.

## Keep decisions and proposals distinct

Label an approach as proposed, recommended, selected, rejected, or superseded
only when the evidence establishes that state. Include rationale and material
tradeoffs with the decision they support. A polished technical section does not
authorize its implementation.

## Separate completion from test mechanics

Completion or acceptance conditions say what must be observably true. A test or
verification strategy says how evidence may be gathered. Keep both when
material; do not substitute a list of tests for the intended outcome or claim
that planned testing is a result.

Before publishing, compare the work item with the source once more for lost
constraints, caveats, alternatives, and open questions.
