---
type: Explanation
title: State and continuity
description: How harnesses preserve task and execution state across long work, retries, interruption, and handoff.
tags: [harness, state, continuity, checkpoints, retries, handoff]
status: stable
sources:
  - id: ai-harness-runtime
    resource: https://arxiv.org/abs/2605.13357
    title: AI Harness Engineering — A Runtime Substrate for Foundation-Model Software Agents
generated:
  by: codex/gpt-5.6
  at: 2026-08-14T22:24:33Z
stale_after: 2027-02-14
---

# State and continuity

Agent work produces at least two kinds of state. **Task state** records the
goal, decisions, progress, and remaining obligations. **Execution state**
records actions and environmental effects. A harness should not hide either
inside one transient conversation.

The harness owns durable storage, identifiers, checkpoints, reconciliation,
and resume mechanics. Agent engineering owns which remembered information may
influence future behavior and how resumed state changes the next decision.
Context engineering owns selection, provenance, freshness, representation,
compaction, and retirement of information presented again.

Persist only what later work needs, but make checkpoints attributable and
resume-safe. A replacement worker should be able to distinguish confirmed
facts from hypotheses, completed effects from intended actions, and current
authority from permissions that applied to an earlier run.

Retries require idempotency or explicit reconciliation. Before repeating an
action, the harness should establish whether its prior attempt had no effect,
completed, or partially completed. Continuity therefore depends on durable
identifiers, observable effects, checkpoints, and recovery rules—not simply on
retaining more text.[^ai-harness-runtime]

[^ai-harness-runtime]: AI Harness Engineering — A Runtime Substrate for Foundation-Model Software Agents
