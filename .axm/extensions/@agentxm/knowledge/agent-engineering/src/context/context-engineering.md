---
type: Explanation
title: Context engineering
description: How the informational environment is selected, structured, routed, used, refreshed, and retired.
tags: [context-engineering, retrieval, routing, memory, feedback, lifecycle]
status: stable
generated: { by: "codex/gpt-5.6", at: 2026-08-14T22:24:33Z }
stale_after: 2027-02-09
sources:
  - id: anthropic-context
    resource: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
    title: Anthropic — Effective context engineering for AI agents
  - id: context-files-evaluation
    resource: https://arxiv.org/abs/2602.11988
    title: Evaluating AGENTS.md — Are Repository-Level Context Files Helpful for Coding Agents?
---

# Context engineering

**Context engineering** shapes the informational environment in which an agent
makes decisions. It determines what information is available, how it is
represented, when it enters attention, how it changes during work, and when it
should be refreshed or discarded.

It is a cross-cutting responsibility within agent systems, not a synonym for an
agent or its harness. Agent engineering defines what evidence and remembered
information behavior requires. Context engineering selects and represents that
information. Harness engineering implements retrieval and persistence. Context
cannot provision an execution environment, enforce a permission boundary, or
prove an external effect.

## Context is a lifecycle

```text
source → select → structure → route → load → use → refresh or retire
```

Every transition is a design choice. Accurate information can still be harmful
if it is loaded for every task, arrives after the relevant decision, lacks
provenance, or survives after its source changes.

Anthropic frames context as a finite resource whose contents should remain
high-signal through compact tools and just-in-time retrieval.[^anthropic-context]

## Prompting is one context technique

Prompt engineering designs intentional model-facing instructions and response
contracts. Context engineering owns the wider inference state: task input,
retrieved material, tool definitions and results, message history, working
state, memory, and feedback. The prompt may be correct while the overall
context remains stale, excessive, untrusted, or mistimed.

## Feedforward and feedback

- **Feedforward context** arrives before action: intent, constraints,
  procedures, examples, and known state.
- **Feedback context** arrives after action: observations, errors, tests,
  review findings, and changed environmental state.

Strong context engineering makes both directions compact and actionable. A
specific failing check can carry more decision value than another paragraph of
advance admonition.

Feedback becomes context when it is represented for a subsequent decision.
The agent's behavioral policy owns whether that evidence causes reflection,
replanning, retry, fallback, escalation, or termination.

## Context is not improved by accumulation alone

A 2026 repository study found that additional context-file guidance increased
exploration and cost without a significant task-success improvement, supporting
minimal necessary requirements and representative evaluation rather than
assumed value.[^context-files-evaluation]

Common failures include context dumping, missing routes, wrong scope, stale
authority, history dependence, feedback flooding, untrusted injection, and
compaction loss.

[^anthropic-context]: Anthropic — Effective context engineering for AI agents

[^context-files-evaluation]: Evaluating AGENTS.md — Are Repository-Level Context Files Helpful for Coding Agents?
