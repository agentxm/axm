---
type: Reference
title: Prompt contracts
description: How goals, constraints, authority, evidence, uncertainty, and completion become an observable interaction.
tags: [prompt-contract, task, constraints, authority, uncertainty, completion]
status: stable
generated: { by: "codex/gpt-5.6", at: 2026-08-14T20:43:46Z }
stale_after: 2027-02-14
sources:
  - id: openai-guidance
    resource: https://developers.openai.com/api/docs/guides/latest-model
    title: OpenAI — Model guidance
  - id: anthropic-overview
    resource: https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview
    title: Anthropic — Prompt engineering overview
---

# Prompt contracts

A prompt contract describes behavior that an observer can grade. Begin with the
outcome and failure conditions; do not begin by selecting a prompting technique.

## Contract fields

| Field       | Required question                                                         |
| ----------- | ------------------------------------------------------------------------- |
| Goal        | What must the response help accomplish?                                   |
| Inputs      | What will be supplied, discovered, or unavailable?                        |
| Definitions | Which terms, labels, and thresholds need precise meaning?                 |
| Constraints | What must remain true, absent, bounded, or unchanged?                     |
| Authority   | What may the model decide, propose, inspect, or change?                   |
| Evidence    | What support, citations, observations, or calculations are required?      |
| Uncertainty | When should the response qualify, ask, abstain, or name missing evidence? |
| Output      | Which content, structure, order, length, and audience are required?       |
| Completion  | What indicates that the interaction has fulfilled its job?                |
| Non-goals   | Which adjacent decisions or actions remain elsewhere?                     |

Use the least instruction that fully expresses the contract. OpenAI recommends
outcome-focused prompts that name the goal, relevant context, constraints,
required evidence, success criteria, and output format, while avoiding repeated
instructions.[^openai-guidance]

Define success criteria before optimizing wording. Otherwise a change can make
the output feel different without establishing that it is better.[^anthropic-overview]

Prompt authority remains communicative rather than enforceable. If violating a
boundary would create unacceptable effects, the harness must prevent the effect
instead of relying on the model to remember the instruction.

[^openai-guidance]: OpenAI — Model guidance

[^anthropic-overview]: Anthropic — Prompt engineering overview
