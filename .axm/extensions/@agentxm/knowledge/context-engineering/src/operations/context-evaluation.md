---
type: How-to Guide
title: Context evaluation
description: How context evaluation specializes general evaluation through selection, destination, authority, freshness, use, and economy evidence.
tags: [context-evaluation, routing, ablation, freshness, cost, representative-tasks]
status: stable
generated: { by: "codex/gpt-5.6", at: 2026-08-14T21:14:15Z }
stale_after: 2027-02-14
sources:
  - id: anthropic-context
    resource: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
    title: Anthropic — Effective context engineering for AI agents
  - id: context-files-evaluation
    resource: https://arxiv.org/abs/2602.11988
    title: Evaluating AGENTS.md — Are Repository-Level Context Files Helpful for Coding Agents?
---

# Context evaluation

Apply general evaluation practice to the context path, not only the final
response. Context evaluation owns evidence about information availability,
routing, selection, authority, freshness, use, and economy. A correct
destination cannot help if it was never discovered, and a selected source can
be accurate yet unused or too expensive.

## Dimensions

| Dimension    | Question                                                          |
| ------------ | ----------------------------------------------------------------- |
| Availability | Did the needed source or observation exist?                       |
| Routing      | Could the agent discover it from realistic entry points?          |
| Selection    | Did relevant tasks load it and adjacent tasks reject it?          |
| Destination  | Did the selected material fulfill its advertised purpose?         |
| Authority    | Were source, trust, scope, and precedence interpreted correctly?  |
| Freshness    | Was the information current enough for the decision?              |
| Use          | Did it materially affect the intended reasoning or action?        |
| Economy      | Were tokens, latency, calls, and retrieval depth proportionate?   |
| Outcome      | Did the complete system improve without unacceptable regressions? |

## Evaluation workflow

1. Choose representative tasks and likely entry points.
2. Capture the initial and dynamically loaded context with source identities.
3. Trace routes, retrievals, tool results, compactions, and feedback.
4. Grade each dimension separately.
5. Compare against the current state, an ablation, or a smaller context set.
6. Repeat nondeterministic cases enough to reveal material variance.
7. Inspect traces to distinguish a routing defect from a destination defect.
8. Retain failures as regression cases and re-evaluate after source changes.

Anthropic recommends the smallest set of high-signal context rather than the
largest available set.[^anthropic-context] Empirical repository work also shows
that more context can increase cost without improving success, so token count
and task outcome must be measured together.[^context-files-evaluation]

Do not call an unobserved source effective merely because it was installed or
linked. Do not call context correct merely because the final answer happened to
pass once.

[^anthropic-context]: Anthropic — Effective context engineering for AI agents

[^context-files-evaluation]: Evaluating AGENTS.md — Are Repository-Level Context Files Helpful for Coding Agents?
