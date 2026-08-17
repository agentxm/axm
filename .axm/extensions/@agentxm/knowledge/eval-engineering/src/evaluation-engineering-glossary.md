---
type: Reference
title: Evaluation engineering glossary
description: Defines the bundle's core terms and disambiguates overloaded evaluation language.
tags: [terminology, eval-suite, trial, grader, trajectory, evaluation-harness]
status: stable
generated: { by: "codex/gpt-5.6", at: 2026-08-14T21:14:15Z }
stale_after: 2027-02-14
sources:
  - id: anthropic-evals
    resource: https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
    title: Anthropic — Demystifying evals for AI agents
---

# Evaluation engineering glossary

**Evaluation**
: A complete measurement system that applies cases and grading to a named
target to support a decision.

**Task or case**
: One defined input, fixture set, and set of success conditions.

**Trial**
: One attempt at one case under a recorded configuration.

**Transcript, trace, or trajectory**
: The recorded sequence of interactions, actions, observations, and
intermediate results from a trial.

**Outcome**
: The final externally observable state or artifact produced by a trial.

**Grader**
: Logic or judgment that maps evidence to a score, label, or disposition.

**Metric**
: A defined quantity produced or consumed by evaluation; not the evaluation by
itself.

**Evaluation suite**
: A purposeful collection of cases measuring related capabilities or risks.

**Evaluation harness**
: Infrastructure that provisions and runs trials, captures evidence, invokes
graders, and aggregates results.

**Agent harness or scaffold**
: The operational system that enables a model to act through inputs, tools,
state, permissions, orchestration, and outputs.

**Baseline**
: The named target or prior evidence against which a candidate is compared.

**Slice**
: A meaningful subset of results used to reveal behavior hidden by aggregation.

Anthropic uses the task, trial, grader, transcript, outcome, evaluation
harness, agent harness, and suite distinctions for agent evaluations.[^anthropic-evals]

[^anthropic-evals]: Anthropic — Demystifying evals for AI agents
