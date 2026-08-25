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
  - id: persona-evaluation
    resource: https://arxiv.org/abs/2311.10054
    title: "When A Helpful Assistant Is Not Really Helpful: Personas in System Prompts Do Not Improve Performances of Large Language Models"
generated: { by: "codex/gpt-5.6", at: 2026-08-24T13:32:38Z }
stale_after: 2027-02-24
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

## Role contracts are not personas

A role contract assigns responsibility, authority, boundaries, evidence, and
coordination obligations. A persona supplies a voice, perspective, or simulated
identity. Use a persona when that presentation or simulation is part of the
desired behavior; do not treat “expert,” “helpful,” or another identity label as
evidence of knowledge, judgment, or reliability. Controlled studies of factual
questions found no general performance improvement from system-prompt personas,
with effects varying across labels.[^persona-evaluation]

If a persona is retained, state the observable behavior it should change and
evaluate that behavior against a no-persona baseline. Keep capability claims in
the goal contract, tools, context, and completion evidence.

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
[^persona-evaluation]: When A Helpful Assistant Is Not Really Helpful — Personas in System Prompts Do Not Improve Performances of Large Language Models
