---
type: Reference
title: Repository context map
description: How instructions, knowledge, code, tests, tools, runtime observations, and remote workers form a discoverable context system.
tags: [repository-context, coding-agents, source-code, tests, tools, remote-agents]
status: stable
generated: { by: "codex/gpt-5.6", at: 2026-08-14T20:43:46Z }
---

# Repository context map

A repository is one context source within a wider software-engineering
environment. Trace representative tasks across every source that may define
intent, implementation, verification, or observed state.

| Surface                                  | Context role                                 | Typical authority                               |
| ---------------------------------------- | -------------------------------------------- | ----------------------------------------------- |
| Root and local instructions              | Persistent invariants and discovery routes   | Repository operating policy for their scope     |
| Issue, case, or request                  | Current outcome and constraints              | Accepted task intent                            |
| Design or specification                  | Intended behavior, contracts, and rationale  | Depends on explicit lifecycle model             |
| Source and configuration                 | Current implementation                       | Built revision under inspection                 |
| Schemas, types, and generated contracts  | Mechanically represented interface           | Generator or canonical schema source            |
| Tests and checks                         | Bounded executable claims                    | Properties the check actually observes          |
| Skills and guides                        | Reusable judgment and procedure              | Their declared workflow, not project policy     |
| Tool output, logs, metrics, and UI state | Current environment observations             | Time- and environment-bound evidence            |
| Plan, ledger, or checkpoint              | Current progress and accepted task decisions | Active work record                              |
| Remote worker or CI result               | Evidence from another environment            | Named revision, configuration, and run identity |

## Trace by entry point

1. Start with the instructions and request the agent actually receives.
2. Follow only discoverable routes before using omniscient repository search.
3. Identify which source owns each consequential claim.
4. Record repository revision, working tree, environment, and runtime identity.
5. Distinguish local observations from remote or deployed state.
6. Confirm how the agent can establish completion or recover from conflict.

Common defects include accurate but undiscoverable documentation, stale plans
treated as current, generated files mistaken for canonical sources, tests whose
scope is overstated, remote results without revision identity, and essential
state retained only in one conversation.
