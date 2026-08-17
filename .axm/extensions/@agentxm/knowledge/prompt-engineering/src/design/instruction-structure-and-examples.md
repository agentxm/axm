---
type: Explanation
title: Instruction structure and examples
description: How specificity, ordering, delimiters, and demonstrations steer behavior without brittle overconstraint.
tags: [instructions, few-shot, examples, delimiters, ordering, specificity]
status: stable
generated: { by: "codex/gpt-5.6", at: 2026-08-14T20:43:46Z }
stale_after: 2027-02-14
sources:
  - id: anthropic-context
    resource: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
    title: Anthropic — Effective context engineering for AI agents
  - id: google-prompting
    resource: https://ai.google.dev/gemini-api/docs/prompting-strategies
    title: Google — Prompt design strategies
  - id: openai-guidance
    resource: https://developers.openai.com/api/docs/guides/latest-model
    title: OpenAI — Model guidance
---

# Instruction structure and examples

Structure makes distinctions visible; it does not compensate for an undefined
contract. Use headings, tags, or other consistent delimiters when they help the
model distinguish task, instructions, examples, variable data, and output.

## Choose the right specificity

| Too little                                 | Useful middle                                                | Too much                                    |
| ------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------- |
| Vague aspiration or assumed shared context | Concrete goal, constraints, criteria, and bounded heuristics | Brittle pseudo-code for every possible case |

Anthropic recommends clear, direct prompts at an altitude between vague
guidance and hard-coded procedural logic.[^anthropic-context] State each rule
once, keep the smallest sufficient set, and add detail in response to measured
failures rather than imagined edge cases.[^openai-guidance]

## Use examples as evidence-bearing instructions

Examples are valuable when they demonstrate judgment, boundary cases, tone, or
a response shape more clearly than prose. They should be:

- representative of the claimed input distribution;
- diverse enough not to teach an incidental shortcut;
- internally consistent in labels, whitespace, and field order;
- explicit about the property being demonstrated; and
- paired with negative or edge behavior when the boundary matters.

Google notes that few-shot examples steer format, phrasing, scope, and broader
patterns, while too many examples can overfit behavior to the demonstrations.[^google-prompting]

Examples do not override contradictory instructions. When prose and examples
disagree, repair the contract instead of adding another example.

## Treat order as a variable

Prompt content order can change output. Place critical behavioral constraints
where the host gives them appropriate authority, keep related sections
together, and test alternate order when a material failure may be positional.
Do not elevate data merely by placing it near higher-authority instructions.

[^anthropic-context]: Anthropic — Effective context engineering for AI agents

[^google-prompting]: Google — Prompt design strategies

[^openai-guidance]: OpenAI — Model guidance
