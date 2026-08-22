---
type: Reference
title: Context forms and lifecycles
description: How persistent guidance, task state, knowledge, observations, feedback, and memory require different owners and retention.
tags: [context-forms, instructions, task-state, knowledge, observations, feedback, memory]
status: stable
generated: { by: "codex/gpt-5.6", at: 2026-08-14T20:43:46Z }
stale_after: 2027-02-14
---

# Context forms and lifecycles

“Context” groups information with different authorities, audiences, costs, and
lifetimes. Treating it as one store produces stale authority and accidental
retention.

| Form                 | Primary job                                     | Typical owner                        | Lifecycle signal           |
| -------------------- | ----------------------------------------------- | ------------------------------------ | -------------------------- |
| Persistent guidance  | Shape decisions across a known scope            | Instruction or policy surface        | Scope or policy changes    |
| Task context         | State current goal, constraints, and acceptance | Request, issue, case, or plan        | Task completes or changes  |
| Retrieved knowledge  | Supply relevant detail on demand                | Canonical knowledge or documentation | Source revision or expiry  |
| Observed environment | Describe current external state                 | Tool, file, API, UI, log, metric     | Observation becomes stale  |
| Feedback             | Report consequence, failure, or verification    | Check, review, test, or monitor      | Next action consumes it    |
| Working state        | Preserve decisions, progress, and open loops    | Plan, ledger, checkpoint             | Work advances or hands off |
| Compressed history   | Carry selected prior interaction forward        | Compaction or summary artifact       | Recompact or supersede     |
| Personal preference  | Shape interaction across tasks                  | User-controlled preference store     | User revises or revokes    |

## Ownership rules

- Persistent instructions should not become a task backlog.
- Conversation history should not be the only durable record of accepted
  decisions or externally meaningful state.
- Retrieved text does not become authoritative merely because it entered the
  context window.
- Tool output should identify observation time and relevant source identity.
- Feedback should preserve the evidence and recovery information needed for the
  next decision, not every raw byte that produced it.
- Compaction must distinguish accepted facts, tentative inference, completed
  work, unresolved questions, and superseded state.

Each form needs an explicit route into attention and a retirement condition.
Without both, context systems accumulate plausible but ownerless information.
