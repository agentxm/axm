---
type: Explanation
title: Instruction structure and examples
description: How specificity, ordering, delimiters, and demonstrations steer behavior without brittle overconstraint.
tags: [instructions, few-shot, examples, delimiters, ordering, specificity, rationale, emphasis]
status: stable
generated: { by: "codex/gpt-5.6", at: 2026-08-24T13:32:38Z }
stale_after: 2027-02-24
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
  - id: underspecification
    resource: https://arxiv.org/abs/2505.13360
    title: "What Prompts Don't Say: Understanding and Managing Underspecification in LLM Prompts"
  - id: persona-evaluation
    resource: https://arxiv.org/abs/2311.10054
    title: "When A Helpful Assistant Is Not Really Helpful: Personas in System Prompts Do Not Improve Performances of Large Language Models"
  - id: instruction-hierarchy
    resource: https://arxiv.org/abs/2502.08745
    title: "IHEval: Evaluating Language Models on Following the Instruction Hierarchy"
---

# Instruction structure and examples

Structure makes distinctions visible; it does not compensate for an undefined
contract. Use headings, tags, or other consistent delimiters when they help the
model distinguish task, instructions, examples, variable data, and output.

## Choose the right specificity

| Too little | Useful middle | Too much |
| --- | --- | --- |
| Vague aspiration or assumed shared context | Concrete goal, constraints, criteria, and bounded heuristics | Brittle pseudo-code for every possible case |

Anthropic recommends clear, direct prompts at an altitude between vague
guidance and hard-coded procedural logic.[^anthropic-context] State each rule
once, keep the smallest sufficient set, and add detail in response to measured
failures rather than imagined edge cases.[^openai-guidance]

## Select instruction elements deliberately

| Element | Useful when | Risk or ambiguity | Evidence to require |
| --- | --- | --- | --- |
| Goal contract | Outcome, authority, evidence, and stop conditions need alignment | Vague goals invite incompatible interpretations | Observable completion and boundary behavior |
| Scope-wide invariant | A consequential rule is true throughout its named scope | Broad wording creates conflicts or irrelevant work | Scope coverage, violation consequence, and a check where possible |
| Example | Judgment, a boundary, or an output shape is easier to demonstrate than describe | Incidental details, order, or labels can become shortcuts | Representative and held-out cases; an ablation when material |
| Persona | Voice, perspective, or simulation is itself part of the requested behavior | Generic or expert labels can add stereotype and do not confer capability | Direct style or simulation measures, not assumed expertise |
| Tone label | A compact label reliably names a known presentation contract | Labels such as “professional” are interpreted inconsistently | Concrete audience, examples, or observable style criteria |
| Procedure | Ordering or recovery behavior is operationally necessary | Over-specification can make the agent brittle or waste work | Trajectory and economy evidence across variants |
| Formatting rule | A consumer, schema, or review surface requires exact presentation | Extra constraints compete with semantic work | Parser or contract checks plus semantic-quality evaluation |

No element is helpful merely because it appears in a prompt. Underspecified
requirements can be fragile across prompt or model changes, while adding every
possible requirement can also reduce joint compliance.[^underspecification]

## Use rationale when it clarifies application

A concise rationale can clarify why a rule applies, which tradeoff it protects,
or how to handle an unenumerated case. It is not a guarantee of generalization,
and it consumes context. Evaluate whether the rationale resolves the observed
ambiguity more effectively than a sharper condition, example, tool contract, or
external check.

Capitalized absolutes, repetition, stacked warnings, extra personas, or more
examples are not reliable escalation mechanisms. Anthropic's Skill Creator
treats an all-capitals `ALWAYS` or `NEVER` as a signal to reconsider the
formulation.[^anthropic-skill-creator] When a rule is repeatedly violated,
investigate ambiguity, conflict, scope, context selection, tool semantics,
enforcement, model capability, and evaluation validity before adding more
prompt content. Instruction-priority conflicts are a distinct failure mode and
should be tested explicitly.[^instruction-hierarchy]

Reserve absolutes for genuine scope-wide invariants: rules that are true
throughout the named scope, consequential, observable or checkable,
nonconflicting, and not merely preferences. Safety, authority boundaries,
irreversible effects, and legal or contractual obligations often qualify.

## Use examples as evidence-bearing instructions

Examples are valuable when they demonstrate judgment, boundary cases, tone, or
a response shape more clearly than prose. They should be:

- representative of the claimed input distribution;
- diverse enough not to teach an incidental shortcut;
- internally consistent in labels, whitespace, and field order;
- explicit about the property being demonstrated; and
- paired with negative or edge behavior only when evaluation shows that the
  boundary is material and prose alone is insufficient.

Google notes that few-shot examples steer format, phrasing, scope, and broader
patterns, while too many examples can overfit behavior to the demonstrations.[^google-prompting]

Examples do not override contradictory instructions. When prose and examples
disagree, repair the contract instead of adding another example.

Use personas for requested voice, perspective, audience simulation, or
role-play. Do not use a generic or expert persona as a substitute for a goal,
responsibility, domain context, evidence, or tool access. Controlled factual
question studies found no general accuracy improvement from persona labels and
effects varied unpredictably across personas.[^persona-evaluation]

## Treat order as a variable

Prompt content order can change output. Place critical behavioral constraints
where the host gives them appropriate authority, keep related sections
together, and test alternate order when a material failure may be positional.
Do not elevate data merely by placing it near higher-authority instructions.

[^anthropic-context]: Anthropic — Effective context engineering for AI agents
[^google-prompting]: Google — Prompt design strategies
[^openai-guidance]: OpenAI — Model guidance
[^anthropic-skill-creator]: Anthropic — Skill Creator
[^underspecification]: What Prompts Don't Say — Understanding and Managing Underspecification in LLM Prompts
[^persona-evaluation]: When A Helpful Assistant Is Not Really Helpful — Personas in System Prompts Do Not Improve Performances of Large Language Models
[^instruction-hierarchy]: IHEval — Evaluating Language Models on Following the Instruction Hierarchy
