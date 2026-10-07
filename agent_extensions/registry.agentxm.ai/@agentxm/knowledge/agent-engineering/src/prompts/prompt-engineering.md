---
type: Explanation
title: Prompt engineering
description: How intentional model-facing instructions become evaluated and maintained engineering artifacts.
tags: [prompt-engineering, instructions, evaluation, lifecycle, model-behavior]
status: stable
generated: { by: "codex/gpt-5.6", at: 2026-08-14T20:43:46Z }
stale_after: 2027-02-14
sources:
  - id: anthropic-overview
    resource: https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview
    title: Anthropic — Prompt engineering overview
  - id: prompt-report
    resource: https://arxiv.org/abs/2406.06608
    title: The Prompt Report — A Systematic Survey of Prompting Techniques
  - id: google-prompting
    resource: https://ai.google.dev/gemini-api/docs/prompting-strategies
    title: Google — Prompt design strategies
---

# Prompt engineering

**Prompt engineering** designs, evaluates, and maintains intentional
model-facing instructions so they produce useful behavior for a defined task
distribution. It includes wording and structure, but its unit of improvement is
an observed behavioral contract rather than an isolated phrase.

Anthropic treats clear success criteria, empirical tests, and a first draft as
preconditions for prompt improvement, and cautions that not every failing
criterion is controllable through prompting.[^anthropic-overview] The Prompt
Report similarly describes a repeated loop:

```text
define behavior → run representative inputs → grade outputs → change one
material prompt choice → compare → retain evidence
```

The report catalogues many techniques but also finds substantial terminology
and evaluation fragmentation.[^prompt-report] A durable practice therefore
starts with simple, explicit contracts and adds a technique only for an
observed failure.

## Appropriate prompt interventions

- clarify the task, constraints, decision rights, or stopping condition;
- separate instructions, examples, and variable data;
- demonstrate a required judgment or output pattern;
- specify response contents, order, or uncertainty behavior;
- repair ambiguity in tool descriptions, grader rubrics, or handoffs; or
- make a reusable instruction template testable and versioned.

## Route elsewhere when

- the wrong or stale information reaches the model — context engineering;
- the model lacks a tool, environment, permission boundary, or verifier —
  harness engineering;
- one reusable workflow needs routing, packaging, resources, and governance —
  skill engineering;
- mechanics require exact enforcement — schema, code, policy, or another
  deterministic contract; or
- representative evidence shows the model cannot perform the task reliably —
  model, task, or system redesign.

Prompt engineering is iterative. Google likewise presents its techniques as
starting points to refine against observed responses, not universal recipes.[^google-prompting]

[^anthropic-overview]: Anthropic — Prompt engineering overview
[^prompt-report]: The Prompt Report — A Systematic Survey of Prompting Techniques
[^google-prompting]: Google — Prompt design strategies
