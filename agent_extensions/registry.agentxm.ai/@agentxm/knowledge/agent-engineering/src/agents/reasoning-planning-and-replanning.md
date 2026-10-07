---
type: Explanation
title: Reasoning, planning, and replanning
description: Chooses planning commitments and replanning triggers without requiring hidden reasoning disclosure.
tags: [reasoning, planning, replanning, decomposition, commitments, uncertainty]
status: stable
sources:
  - id: agent-survey
    resource: https://arxiv.org/abs/2308.11432
    title: A Survey on Large Language Model based Autonomous Agents
  - id: anthropic-agents
    resource: https://www.anthropic.com/engineering/building-effective-agents
    title: Anthropic — Building effective agents
generated: { by: "codex/gpt-5.6", at: 2026-08-14T22:24:33Z }
stale_after: 2027-02-14
---

# Reasoning, planning, and replanning

Planning is useful when intermediate commitments improve coordination,
verification, cost control, or recovery. It is overhead when the next action is
obvious and cheaply reversible. Agent surveys treat planning as a core
capability with feedback-driven and decomposition-oriented forms.[^agent-survey]

## Plan at the right resolution

- Name intermediate outcomes and dependencies, not speculative keystrokes.
- Bind irreversible or expensive actions to stronger evidence and approval.
- Keep uncertain branches conditional rather than pretending they are settled.
- Record assumptions whose failure should trigger replanning.
- Expose progress and decisions needed by collaborators without demanding
  private chain-of-thought.

Replan when evidence contradicts an assumption, a dependency changes, a chosen
action fails materially, a new risk appears, the remaining goal changes, or a
budget makes the current path uneconomic. Do not replan after every harmless
observation; uncontrolled replanning destroys continuity.

## Match the pattern to the problem

Prompt chaining, routing, parallelization, orchestrator-worker decomposition,
and evaluator-optimizer loops are reusable patterns, not universal stages.[^anthropic-agents]
Use a pattern only when its control structure corresponds to the task:
parallelize independent work, route distinct classes, delegate separable
responsibilities, and iterate only when feedback can materially improve the
artifact.

Evaluate planning through outcomes and trajectories: unnecessary steps,
premature commitment, missed dependencies, failure to revise, oscillation, and
unsafe action are more informative than whether a plan sounds plausible.

[^agent-survey]: A Survey on Large Language Model based Autonomous Agents
[^anthropic-agents]: Anthropic — Building effective agents
