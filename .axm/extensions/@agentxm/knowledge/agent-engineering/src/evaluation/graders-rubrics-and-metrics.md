---
type: Reference
title: Graders, rubrics, and metrics
description: Chooses, calibrates, and combines deterministic, model-based, and human judgment instruments.
tags: [graders, rubrics, metrics, model-judge, human-review, calibration]
status: stable
generated: { by: "codex/gpt-5.6", at: 2026-08-14T21:14:15Z }
stale_after: 2027-02-14
sources:
  - id: anthropic-evals
    resource: https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
    title: Anthropic — Demystifying evals for AI agents
  - id: llm-judge
    resource: https://proceedings.neurips.cc/paper_files/paper/2023/file/91f18a1287b398d378ef22505bf41832-Paper-Datasets_and_Benchmarks.pdf
    title: Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena
---

# Graders, rubrics, and metrics

Use the least subjective instrument that can observe the contract:

| Instrument            | Best use                                                                 | Main risk                              |
| --------------------- | ------------------------------------------------------------------------ | -------------------------------------- |
| Deterministic check   | Schema, tests, tool arguments, external state, limits, forbidden effects | Brittleness to valid alternatives      |
| Reference-based check | Bounded facts or expected components                                     | Incomplete or stale references         |
| Model grader          | Open-ended quality, grounded rubrics, pairwise discrimination            | Nondeterminism and systematic bias     |
| Human grader          | Consequential, novel, preference-sensitive, or calibration work          | Cost, delay, and reviewer disagreement |

Define graders before inspecting candidate outputs. Keep critical dimensions
separate, give partial credit only where it represents meaningful partial
success, and provide `unknown` when evidence is insufficient. Anthropic
recommends deterministic grading where possible and human-calibrated model
graders where interpretation is necessary.[^anthropic-evals]

Treat a model grader as a measurement instrument:

- use a narrow rubric with observable anchors;
- calibrate against reviewed examples and measure disagreements;
- record model, prompt, context, sampling, and rubric versions;
- swap comparison order and test irrelevant style variation;
- avoid having one opaque score hide safety or authority failures; and
- periodically regrade a stable calibration set.

Published research reports position, verbosity, self-preference, and reasoning
limitations in LLM judges.[^llm-judge] A grader must earn trust; fluent
explanations do not establish validity.

[^anthropic-evals]: Anthropic — Demystifying evals for AI agents

[^llm-judge]: Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena
