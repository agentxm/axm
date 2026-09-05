---
type: Explanation
title: Memory, compaction, feedback, and continuity
description: How working state survives long tasks without turning history into authority.
tags: [memory, compaction, continuity, working-state, feedback, handoff]
status: stable
generated: { by: "codex/gpt-5.6", at: 2026-08-14T20:43:46Z }
stale_after: 2027-02-14
sources:
  - id: anthropic-context
    resource: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
    title: Anthropic — Effective context engineering for AI agents
  - id: anthropic-harness
    resource: https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
    title: Anthropic — Effective harnesses for long-running agents
---

# Memory, compaction, feedback, and continuity

Long work outlives individual context windows. Continuity requires durable,
inspectable state rather than dependence on one transcript.

## Separate memory roles

- user preferences across tasks;
- shared domain or organizational knowledge;
- environment-local facts and observations;
- accepted task decisions and rationale;
- current progress, remaining work, and blockers;
- mechanically derived execution state; and
- compressed interaction history.

Each role has different authority, retention, privacy, and refresh rules. Do not
accumulate them into an undifferentiated “memory.”

## Compaction contract

Preserve:

- the current objective and authority;
- accepted decisions and material rationale;
- current source, revision, and environment identities;
- completed work and objective evidence;
- unresolved questions, failures, and next actions;
- constraints whose relevance may emerge later; and
- routes to deeper sources instead of copied depth.

Discard repetition, superseded hypotheses, low-value raw output, and narration
that does not affect future decisions. Label inference and uncertainty rather
than compacting them into facts.

Anthropic describes compaction as a primary mechanism for long-horizon
coherence and warns that aggressive summaries can discard details whose
importance emerges later.[^anthropic-context] Its long-running harness work
also uses explicit progress artifacts so later sessions can resume without
reconstructing the project from conversation history.[^anthropic-harness]

## Feedback into continuity

Feedback should update working state only after its evidence is interpreted.
A failed test may revise a hypothesis; it does not automatically supersede the
goal. A successful action claim should not become accepted state until the
environment verifies the effect.

Evaluate resume behavior from a fresh session: can it identify the objective,
authority, current state, evidence, and next action without silently reviving
superseded context?

[^anthropic-context]: Anthropic — Effective context engineering for AI agents
[^anthropic-harness]: Anthropic — Effective harnesses for long-running agents
