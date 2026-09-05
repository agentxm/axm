---
type: Explanation
title: Authority and containment
description: How harnesses grant useful capability while structurally limiting effects and escalation.
tags: [harness, authority, permissions, containment, sandbox, approvals]
status: stable
sources:
  - id: ai-harness-runtime
    resource: https://arxiv.org/abs/2605.13357
    title: AI Harness Engineering — A Runtime Substrate for Foundation-Model Software Agents
generated: { by: "codex/gpt-5.6", at: 2026-08-14T22:24:33Z }
stale_after: 2027-02-14
---

# Authority and containment

Authority defines which resources and actions an agent may use. Containment
limits the effects an agent can produce even when its reasoning or instructions
fail. Reliable harnesses express consequential boundaries structurally.

Agent engineering defines which authority the role needs and when the agent
should request approval, decline, or escalate. Harness engineering owns the
credentials, permission checks, sandboxes, budgets, approval gates, and other
mechanisms that enforce those limits.

Grant the least authority that still permits the task, scoped by resource,
operation, environment, duration, and identity. Separate read, propose, stage,
approve, and execute capabilities when their consequences differ. Make denial
legible so the agent can choose a safe alternative or escalate.

Instructions remain useful for judgment and collaboration, but they are not a
security boundary. Use sandboxes, isolated credentials, network and filesystem
policy, approval gates, quotas, and reversible workflows to enforce limits.
Log consequential decisions and effects without exposing secrets.[^ai-harness-runtime]

[^ai-harness-runtime]: AI Harness Engineering — A Runtime Substrate for Foundation-Model Software Agents
