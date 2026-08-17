---
type: Explanation
title: Boundaries, authority, and state
description: How authority and state ownership give structural boundaries meaning and constrain what may cross them.
tags: [boundaries, authority, state-ownership, trust-boundary, integration]
status: draft
generated:
  by: codex/gpt-5
  at: 2026-08-15T15:20:54Z
---

# Boundaries, authority, and state

A boundary is meaningful when it separates responsibilities, authority, trust,
or change. A box on a diagram without one of those distinctions is merely a
grouping.

For each significant boundary, identify:

- the decisions made on each side;
- the state each side owns;
- what information may cross;
- what must be validated at entry;
- which failures can propagate; and
- which guarantees the boundary presents to callers.

State should have one authoritative owner. Copies may exist for performance,
availability, or local use, but their status must be explicit: cache, replica,
projection, snapshot, or independent record. Two writable sources claiming the
same authority create reconciliation as an undeclared system responsibility.

Trust does not transfer merely because data crossed a process or package
boundary. Validate where authority changes, where an external actor enters, and
where a weaker guarantee is converted into a stronger one.

Boundaries should follow stable differences in policy and ownership. Splitting
elements only because implementation files differ adds ceremony; collapsing
distinct authorities because they share a runtime hides consequential coupling.
