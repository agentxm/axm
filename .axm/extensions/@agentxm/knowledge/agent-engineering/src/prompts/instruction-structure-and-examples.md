---
type: Explanation
title: Instruction structure and examples
description: How specificity, ordering, delimiters, and demonstrations steer behavior without brittle overconstraint.
tags: [instructions, few-shot, examples, delimiters, ordering, specificity, rationale, emphasis]
status: stable
generated: { by: "claude-code/claude-opus-5", at: 2026-08-22T14:21:16Z }
stale_after: 2027-02-22
sources:
  - id: anthropic-skill-creator
    resource: https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md
    title: Anthropic — Skill Creator
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

## Prefer stated reasons to escalating emphasis

A capable model generalizes from a reason and cannot generalize from an
unexplained absolute. A constraint whose purpose is stated holds in situations
the author never enumerated; a constraint asserted only as mandatory holds
exactly as far as its wording reaches.

Escalating emphasis — capitalized absolutes, repetition, stacked warnings — is
usually evidence that the contract is underspecified rather than that it needs
more force. Anthropic's Skill Creator treats an all-capitals `ALWAYS` or `NEVER`
as a signal to reframe and explain the reasoning instead.[^anthropic-skill-creator]
When a rule is repeatedly violated, look for the missing reason, a conflicting
instruction, or the case the wording does not reach.

Reserve absolutes for genuine invariants: safety, authority boundaries,
irreversible effects, and legal or contractual obligations. There the
categorical form is the content, and a stated reason reinforces it rather than
softening it.

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

[^anthropic-skill-creator]: Anthropic — Skill Creator
