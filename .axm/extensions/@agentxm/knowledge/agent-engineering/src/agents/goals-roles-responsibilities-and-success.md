---
type: Reference
title: Goals, roles, responsibilities, and success
description: Defines what the agent is responsible for, what completion means, and what remains outside its authority.
tags: [goals, roles, responsibilities, success-criteria, completion, constraints, escalation]
status: stable
sources:
  - id: gaia
    resource: https://eprints.soton.ac.uk/253748/
    title: The Gaia methodology for agent-oriented analysis and design
  - id: openai-guide
    resource: https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/
    title: OpenAI — A practical guide to building agents
generated: { by: "codex/gpt-5.6", at: 2026-08-14T22:24:33Z }
stale_after: 2027-02-14
---

# Goals, roles, responsibilities, and success

Start with a **goal contract**, not a persona. A useful contract states:

| Part | Required question |
| --- | --- |
| Outcome | What externally meaningful result is sought? |
| Role | Which responsibilities belong to this actor? |
| Boundaries | What must it not decide, represent, or change? |
| Evidence | What observations can establish progress and completion? |
| Constraints | Which quality, cost, time, safety, and policy limits apply? |
| Stop conditions | When is success, exhaustion, invalidity, or cancellation reached? |
| Escalation | Which uncertainty, conflict, or consequence requires another actor? |

Classical agent-oriented engineering emphasized roles, permissions,
responsibilities, activities, protocols, safety properties, and liveness
properties.[^gaia] Those distinctions remain useful even when a foundation
model performs the reasoning.

Describe success through observable state and acceptable evidence. “Be helpful”
is a disposition; “produce an approved change that passes named checks” is a
contract. Separate task completion from the agent's confidence or its claim of
completion.

Avoid conflicting goals without a precedence rule. If speed, thoroughness,
cost, privacy, or reversibility trade off, specify which actor may choose and
when escalation is required. Keep responsibility aligned with authority: an
agent should not own an outcome it cannot observe, affect, or verify.

OpenAI similarly frames an agent around a model, tools, and instructions, with
clear routines and guardrails for the work it is authorized to perform.[^openai-guide]

[^gaia]: The Gaia methodology for agent-oriented analysis and design
[^openai-guide]: OpenAI — A practical guide to building agents
