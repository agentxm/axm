---
type: Reference
title: Observation, action, and tool-use policy
description: Governs when and why capabilities are selected and how results affect the next decision.
tags: [observations, actions, tools, tool-selection, feedback, capability-policy]
status: stable
sources:
  - id: anthropic-tools
    resource: https://www.anthropic.com/engineering/writing-tools-for-agents
    title: Anthropic — Writing effective tools for agents
  - id: mcp-spec
    resource: https://modelcontextprotocol.io/specification/2025-03-26/index
    title: Model Context Protocol specification
generated: { by: "codex/gpt-5.6", at: 2026-08-14T22:24:33Z }
stale_after: 2027-02-14
---

# Observation, action, and tool-use policy

Agent engineering owns the policy for selecting capabilities; the harness owns
their implementation, permissions, execution, and structural validation.

## Before an action

Require the agent to establish, in proportion to consequence:

- the action's relation to the current goal and plan;
- whether a cheaper observation can reduce uncertainty first;
- which target, parameters, identity, scope, and environment apply;
- whether the effect is reversible, idempotent, previewable, or approval-bound;
- which result will count as success, failure, or ambiguity.

## After an action

Treat tool output as evidence, not truth. Distinguish returned content from the
actual external effect, check identifiers and scope, and reconcile ambiguous
timeouts or partial failures before retrying. Update the plan only from
observations whose provenance and freshness are adequate.

Tools should be distinct, well described, token-efficient, and return
actionable errors; their evaluation should include realistic tasks rather than
schema validity alone.[^anthropic-tools] Protocols such as MCP classify tools
separately from prompts and resources and require implementations to preserve
user consent and safety boundaries.[^mcp-spec]

Avoid giving the model several overlapping tools without a selection rule.
Namespace collisions, huge outputs, hidden defaults, and tools that conflate
read and write behavior increase both error and security risk.

[^anthropic-tools]: Anthropic — Writing effective tools for agents

[^mcp-spec]: Model Context Protocol specification
