---
type: How-to guide
title: How to practice eval-driven prompt development
description: How rendered prompt identity, controlled prompt ablations, and response-contract evidence specialize eval-driven development.
tags: [prompt-evaluation, rendered-prompt, ablation, response-contract, compatibility]
status: stable
generated: { by: "codex/gpt-5.6", at: 2026-08-14T21:14:15Z }
stale_after: 2027-02-14
sources:
  - id: anthropic-tests
    resource: https://platform.claude.com/docs/en/test-and-evaluate/develop-tests
    title: Anthropic — Define success criteria and build evaluations
  - id: openai-guidance
    resource: https://developers.openai.com/api/docs/guides/latest-model
    title: OpenAI — Model guidance
  - id: prompt-report
    resource: https://arxiv.org/abs/2406.06608
    title: The Prompt Report — A Systematic Survey of Prompting Techniques
---

# How to practice eval-driven prompt development

Apply general evaluation practice to the prompt as the changing target. Prompt
evaluation owns attribution to intentional model-facing instructions; it does
not own generic sampling, grader calibration, uncertainty, or suite governance.

## Workflow

1. Recover the response contract and the behavior attributed to the prompt.
2. Establish a representative suite, graders, baseline, and trial policy using
   the evaluation system that governs the complete application.
3. Record the rendered prompt, source revision, model, host, parameters, context and tool
   configuration, variable values, and grader identity.
4. Change one attributable instruction, example, template, ordering rule, or
   other prompt surface where practical.
5. Rerun the same cases under controlled configuration.
6. Grade direct semantic behavior and contractual response presentation
   separately from tool effects, external state, and harness enforcement.
7. Inspect the rendered prompt and raw response when a result changes; source
   templates alone do not show the model's actual input.
8. Keep the prompt revision only when intended behavior improves without an
   unacceptable system regression.

Anthropic recommends criteria aligned to the real task distribution.[^anthropic-tests]
OpenAI recommends changing one attributable instruction, example, or tool group
and rerunning the same evaluations.[^openai-guidance]

## Prompt-specific evidence

- Preserve the exact rendered prompt or an attributable equivalent.
- Distinguish fixed instructions from variable values and retrieved context.
- Verify required fields, relative order, uniqueness, and output schemas when
  presentation is contractual.
- Evaluate prompt compatibility across every claimed model, host, role, and
  tool-schema surface rather than generalizing from one environment.

The Prompt Report documents formatting and phrasing effects across techniques,
so prompt evaluation must preserve the rendered prompt and response rather
than only aggregate scores.[^prompt-report]

[^anthropic-tests]: Anthropic — Define success criteria and build evaluations
[^openai-guidance]: OpenAI — Model guidance
[^prompt-report]: The Prompt Report — A Systematic Survey of Prompting Techniques
