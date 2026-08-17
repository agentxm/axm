---
type: Reference
title: Memory, state, and adaptation policy
description: Governs what may influence future decisions while separating policy from storage mechanics.
tags: [memory, state, adaptation, provenance, retention, personalization, checkpoints]
status: stable
sources:
  - id: agent-survey
    resource: https://arxiv.org/abs/2308.11432
    title: A Survey on Large Language Model based Autonomous Agents
  - id: anthropic-context
    resource: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
    title: Anthropic — Effective context engineering for AI agents
generated: { by: "codex/gpt-5.6", at: 2026-08-14T22:24:33Z }
stale_after: 2027-02-14
---

# Memory, state, and adaptation policy

Memory is not merely persisted text. It is information allowed to influence a
future decision. Agent engineering defines that influence policy; context
engineering owns selection, representation, provenance, freshness, compaction,
and retirement; harness engineering owns storage, retrieval interfaces,
checkpoints, and resume mechanics.

| Policy question | Design requirement                                                                            |
| --------------- | --------------------------------------------------------------------------------------------- |
| Scope           | Is the memory valid for one step, task, user, team, domain, or deployment?                    |
| Authority       | Is it an observation, user preference, decision, hypothesis, instruction, or derived summary? |
| Provenance      | Who or what produced it, from which source and time?                                          |
| Retention       | When must it expire, be reviewed, corrected, or deleted?                                      |
| Retrieval       | Which task conditions justify loading it?                                                     |
| Conflict        | What wins when memory disagrees with current evidence or higher authority?                    |
| Adaptation      | Which behaviors may change from accumulated experience, and who approves that change?         |

Keep task state, execution state, user preferences, domain knowledge, and
learned behavior distinct. A checkpoint says what happened and what remains;
it does not automatically become durable knowledge or a preference.

Long-term memory expands the attack and privacy surface. Prevent untrusted tool
content or another actor's assertion from silently becoming authoritative
future instruction. Prefer explicit write criteria, inspectable entries,
expiry, and correction paths.

Survey models place memory alongside planning and action as a core agent
component.[^agent-survey] Context-engineering guidance emphasizes finite
attention, just-in-time retrieval, and compaction that preserves decision value
rather than accumulating every interaction.[^anthropic-context]

[^agent-survey]: A Survey on Large Language Model based Autonomous Agents

[^anthropic-context]: Anthropic — Effective context engineering for AI agents
