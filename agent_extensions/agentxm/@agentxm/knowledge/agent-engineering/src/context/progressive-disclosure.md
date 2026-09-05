---
type: Explanation
title: Progressive disclosure
description: How compact routes, meaningful selection conditions, and on-demand depth conserve attention.
tags: [progressive-disclosure, routing, retrieval, discovery, attention-budget]
status: stable
generated: { by: "codex/gpt-5.6", at: 2026-08-09T20:53:20Z }
verified:
  - by: codex/gpt-5.6
    at: 2026-08-09T22:13:44Z
stale_after: 2027-02-09
sources:
  - id: anthropic-context
    resource: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
    title: Anthropic — Effective context engineering for AI agents
  - id: cursor-discovery
    resource: https://cursor.com/blog/dynamic-context-discovery
    title: Cursor — Dynamic context discovery
---

# Progressive disclosure

**Progressive disclosure** presents a compact, decision-useful route before
loading the deeper material behind it.

```text
advertise a route → select it when relevant → load the needed depth
```

Agents need enough initial context to discover what could help, but loading
every instruction, tool, document, memory item, and observation consumes finite
attention. Anthropic recommends high-signal context and just-in-time
exploration rather than exhaustive loading.[^anthropic-context]

## Three-part contract

| Part | Responsibility |
| --- | --- |
| Route | Name what exists, when it matters, its boundary, and how to reach it |
| Selection | Decide whether this task warrants the deeper context |
| Depth | Supply enough selected material to act without an unbounded descent |

Depth without a route is invisible. A route without a selection condition loads
too broadly. A destination that does not fulfill its advertised purpose makes
future routing less trustworthy.

## Scope and disclosure

- **Scope** excludes information that does not apply to this task, component,
  role, environment, or user.
- **Progressive disclosure** defers applicable information until the task
  reaches a decision that needs it.

Use both. A broad instruction may advertise a domain route; the domain may
advertise a workflow; the workflow may load one reference only on a specific
branch. Cursor describes similar dynamic discovery for histories, terminals,
tool results, and tool definitions, not only documentation.[^cursor-discovery]

## Evaluate routing separately

1. Did representative tasks discover and select the right route?
2. Once selected, did the destination fulfill its promise?

Do not repair a routing failure by bloating every entry point with the entire
destination.

[^anthropic-context]: Anthropic — Effective context engineering for AI agents
[^cursor-discovery]: Cursor — Dynamic context discovery
