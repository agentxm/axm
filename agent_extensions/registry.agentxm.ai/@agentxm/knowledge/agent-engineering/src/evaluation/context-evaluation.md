---
type: How-to guide
title: How to evaluate a context system
description: How context evaluation specializes general evaluation through selection, destination, authority, freshness, use, and economy evidence.
tags: [context-evaluation, routing, ablation, freshness, cost, representative-tasks]
status: stable
generated: { by: "codex/gpt-5.6", at: 2026-08-24T13:32:38Z }
stale_after: 2027-02-24
sources:
  - id: anthropic-context
    resource: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
    title: Anthropic — Effective context engineering for AI agents
  - id: context-files-evaluation
    resource: https://arxiv.org/abs/2602.11988
    title: Evaluating AGENTS.md — Are Repository-Level Context Files Helpful for Coding Agents?
  - id: context-files-efficiency
    resource: https://arxiv.org/abs/2601.20404
    title: On the Impact of AGENTS.md Files on the Efficiency of AI Coding Agents
  - id: probe-and-refine
    resource: https://arxiv.org/abs/2606.20512
    title: Probe-and-Refine Tuning of Repository Guidance for Coding Agents
---

# How to evaluate a context system

Apply general evaluation practice to the context path, not only the final
response. Context evaluation owns evidence about information availability,
routing, selection, authority, freshness, use, and economy. A correct
destination cannot help if it was never discovered, and a selected source can
be accurate yet unused or too expensive.

## Dimensions

| Dimension | Question |
| --- | --- |
| Availability | Did the needed source or observation exist? |
| Routing | Could the agent discover it from realistic entry points? |
| Selection | Did relevant tasks load it and adjacent tasks reject it? |
| Destination | Did the selected material fulfill its advertised purpose? |
| Authority | Were source, trust, scope, and precedence interpreted correctly? |
| Freshness | Was the information current enough for the decision? |
| Use | Did it materially affect the intended reasoning or action? |
| Economy | Were tokens, latency, calls, and retrieval depth proportionate? |
| Outcome | Did the complete system improve without unacceptable regressions? |

## Evaluation workflow

1. Choose representative development and held-out tasks plus likely entry
   points, including adjacent tasks that should not receive the context.
2. Capture the initial and dynamically loaded context with source identities.
3. Trace routes, retrievals, tool results, compactions, and feedback.
4. Grade each dimension separately.
5. Compare against the current state, a no-context or minimal-context baseline,
   and one-component ablations where those comparisons are meaningful.
6. Repeat nondeterministic cases enough to reveal material variance.
7. Inspect traces to distinguish a routing defect from a destination defect.
8. Retain failures as regression cases and re-evaluate after source, model,
   harness, tool, or surrounding-context changes.

Anthropic recommends the smallest set of high-signal context rather than the
largest available set.[^anthropic-context] Empirical repository work also shows
mixed results: generated guidance increased work without improving success in
one study, another associated instruction files with improved efficiency at
comparable completion, and failure-refined guidance improved resolution in one
narrow setup.[^context-files-evaluation][^context-files-efficiency][^probe-and-refine]
Context claims must therefore bind the production method,
task distribution, model, host, and measures. Grade task outcome, adherence,
trajectory, economy, and safety separately rather than collapsing them into a
single pass rate.

Do not call an unobserved source effective merely because it was installed or
linked. Do not call context correct merely because the final answer happened to
pass once.

[^anthropic-context]: Anthropic — Effective context engineering for AI agents
[^context-files-evaluation]: Evaluating AGENTS.md — Are Repository-Level Context Files Helpful for Coding Agents?
[^context-files-efficiency]: On the Impact of AGENTS.md Files on the Efficiency of AI Coding Agents
[^probe-and-refine]: Probe-and-Refine Tuning of Repository Guidance for Coding Agents
