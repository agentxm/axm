---
type: Reference
title: Agent reliability and failure attribution
description: Diagnoses failures across agency choice, behavioral policy, prompts, context, tools, harness, environment, and evaluation.
tags: [agent-reliability, failure-attribution, diagnosis, recovery, robustness, incidents]
status: stable
sources:
  - id: eval-survey
    resource: https://arxiv.org/abs/2503.16416
    title: Survey on Evaluation of LLM-based Agents
  - id: anthropic-evals
    resource: https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
    title: Anthropic — Demystifying evals for AI agents
generated: { by: "codex/gpt-5.6", at: 2026-08-14T22:24:33Z }
stale_after: 2027-02-14
---

# Agent reliability and failure attribution

Treat reliability as a property of the deployed agent system on a task
distribution, not as a model trait. Attribute a failure before editing the most
visible prompt.

| Surface | Typical failure |
| --- | --- |
| Agency choice | Dynamic control was unnecessary, unsafe, or insufficient |
| Goal and role | Ambiguous outcome, conflicting priorities, missing boundary |
| Planning and stopping | Poor decomposition, no replanning, loops, premature completion |
| Capability policy | Wrong tool, unsafe ordering, bad retry, missed observation |
| Memory and coordination | Stale influence, lost responsibility, conflicting actors |
| Prompt | Misexpressed instruction, example, schema, or response contract |
| Context | Missing, stale, excessive, untrusted, or mistimed information |
| Harness and environment | Broken interface, runtime, state, permission, enforcement, or feedback |
| Evaluation | Unrepresentative case, invalid grader, hidden uncertainty, wrong target identity |

Preserve the trajectory and external state needed to distinguish reasoning
failure from observation failure or mechanical failure. A convincing response
is not evidence that the claimed external outcome occurred; agent evaluation
should grade both transcript behavior and environment results.[^anthropic-evals]

Repair the smallest responsible surface, then rerun representative and
adversarial cases. Add recovery paths only when they do not mask persistent
defects. Track cost, latency, safety, robustness, and human intervention along
with task success.[^eval-survey]

[^eval-survey]: Survey on Evaluation of LLM-based Agents
[^anthropic-evals]: Anthropic — Demystifying evals for AI agents
