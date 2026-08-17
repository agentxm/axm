---
type: Explanation
title: Context engineering boundary
description: Where context engineering fits within the larger harness system.
tags: [harness, context, boundary]
status: stable
sources:
  - id: anthropic-context-engineering
    resource: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
    title: Anthropic — Effective context engineering for AI agents
  - id: openai-harness-engineering
    resource: https://openai.com/index/harness-engineering/
    title: OpenAI — Harness engineering
generated:
  by: codex/gpt-5.6
  at: 2026-08-14T20:51:01Z
stale_after: 2027-02-14
---

# Context engineering boundary

Context engineering shapes the informational environment an agent receives,
discovers, produces, and carries through a task. It owns selection, authority,
routing, retrieval, memory, compaction, and information lifecycle.[^anthropic-context-engineering]

It is one responsibility within harness engineering, not a synonym for the
whole harness. Context can help an agent decide, but it does not provision an
execution environment, enforce a permission boundary, execute an effect, or
prove that an external outcome occurred.[^openai-harness-engineering]

Prompt engineering is narrower still: it designs model-facing instructions and
inputs at particular interaction surfaces. A harness decides when and how those
prompts are composed alongside tools, state, runtime, feedback, and controls.

Use the context-engineering discipline for detailed context decisions. Use
harness engineering when the question crosses information, execution,
interfaces, authority, and evidence.

[^anthropic-context-engineering]: Anthropic — Effective context engineering for AI agents

[^openai-harness-engineering]: OpenAI — Harness engineering
