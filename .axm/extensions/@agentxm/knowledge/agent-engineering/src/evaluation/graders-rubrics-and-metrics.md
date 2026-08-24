---
type: Reference
title: Graders, rubrics, and metrics
description: Chooses, calibrates, and combines deterministic, model-based, and human judgment instruments, and keeps the instrument itself under observation.
tags:
  [graders, rubrics, metrics, model-judge, human-review, calibration, blinding, claim-verification]
status: stable
generated: { by: "claude-code/claude-opus-5", at: 2026-08-22T14:21:16Z }
stale_after: 2027-02-22
sources:
  - id: anthropic-evals
    resource: https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
    title: Anthropic — Demystifying evals for AI agents
  - id: llm-judge
    resource: https://proceedings.neurips.cc/paper_files/paper/2023/file/91f18a1287b398d378ef22505bf41832-Paper-Datasets_and_Benchmarks.pdf
    title: Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena
  - id: anthropic-skill-creator-grader
    resource: https://github.com/anthropics/skills/blob/main/skills/skill-creator/agents/grader.md
    title: Anthropic — Skill Creator grader
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
- withhold which system, revision, or configuration produced each candidate;
- swap comparison order and test irrelevant style variation;
- avoid having one opaque score hide safety or authority failures; and
- periodically regrade a stable calibration set.

Published research reports position, verbosity, self-preference, and reasoning
limitations in LLM judges.[^llm-judge] A grader must earn trust; fluent
explanations do not establish validity.

## Verify what the output claims about itself

Predefined checks cover only anticipated failure. Extract the claims a response
makes about its own work — factual claims about the artifact, process claims
about how the work was done, and quality claims about how well — and verify each
against preserved evidence. Mark a claim unverifiable when the retained evidence
cannot settle it. Anthropic's Skill Creator makes this claim pass a required
grader step beside the declared assertions.[^anthropic-skill-creator-grader]

Grade substance rather than surface compliance: a correct filename over empty
contents fails the assertion it appears to satisfy. Where evidence is
insufficient, the burden of proof stays with the claim.

## Report defects in the instrument

A grader observes the suite as well as the target, and a pass on a weak
assertion is worse than no assertion because it manufactures confidence. Give
the grader a structured channel, separate from grades, for reporting:

- an assertion a clearly wrong output would also satisfy;
- an outcome the grader observed that no assertion covers; and
- an assertion the preserved evidence cannot verify either way.

Keep the bar high enough that each report would earn agreement from the suite's
author rather than nitpicking every assertion. Route the reports to whoever owns
the suite: a grader that repairs the suite mid-run has altered the instrument
during the measurement.

[^anthropic-evals]: Anthropic — Demystifying evals for AI agents

[^llm-judge]: Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena

[^anthropic-skill-creator-grader]: Anthropic — Skill Creator grader
