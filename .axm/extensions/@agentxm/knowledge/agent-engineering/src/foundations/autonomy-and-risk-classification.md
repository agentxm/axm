---
type: Reference
title: Autonomy and risk classification
description: Classifies deployed agency by decision freedom, reach, duration, supervision, reversibility, and consequence.
tags: [autonomy, risk, supervision, authority, reversibility, impact, deployment]
status: stable
sources:
  - id: anthropic-autonomy
    resource: https://www.anthropic.com/research/measuring-agent-autonomy
    title: Anthropic — Measuring agent autonomy in practice
  - id: nist-agent-standards
    resource: https://www.nist.gov/artificial-intelligence/ai-agent-standards-initiative
    title: NIST — AI Agent Standards Initiative
  - id: nist-rmf
    resource: https://www.nist.gov/itl/ai-risk-management-framework
    title: NIST — AI Risk Management Framework
generated: { by: "codex/gpt-5.6", at: 2026-08-14T22:24:33Z }
stale_after: 2027-02-14
---

# Autonomy and risk classification

Autonomy is not one scalar and should not be inferred from a product label.
Classify the deployed configuration across independent axes; empirical autonomy
measurement likewise separates action patterns, human intervention, and task
duration instead of relying on stated product capability.[^anthropic-autonomy]

| Axis | Question |
| --- | --- |
| Decision freedom | Which goals, plans, tools, parameters, and next steps may the model choose? |
| Environment reach | Which data, people, systems, and resources can it observe or affect? |
| Duration and persistence | How long can it continue, resume, or retain influence? |
| Supervision | Which actions are observed, reviewed, approved, interruptible, or unsupervised? |
| Reversibility | Can effects be previewed, staged, rolled back, compensated, or only remediated? |
| Consequence | What financial, legal, safety, privacy, security, social, or operational harm is plausible? |
| Propagation | Can one decision delegate, replicate, trigger workflows, or affect other agents? |

Risk rises through combinations. A narrow but irreversible action may deserve
more control than broad read-only exploration. A short run can still be
high-consequence; a long-lived agent can accumulate authority and stale
assumptions even when each action looks small.

## Design response

For each material risk, choose a behavioral response and an enforcement
response:

- reduce decision freedom or environment reach;
- require stronger evidence before acting;
- stage or simulate effects before commitment;
- insert meaningful human approval or review;
- set time, action, cost, and delegation budgets;
- define stop and escalation conditions;
- add adversarial and failure scenarios to evaluation;
- prohibit the agent deployment when residual risk is unacceptable.

NIST's agent initiative is developing interoperability, identity, security, and
evaluation work; treat its current material as emerging guidance rather than a
complete agent standard.[^nist-agent-standards] Use a general risk-management
process to map context, measure risks, govern controls, and revisit the deployed
configuration as it changes.[^nist-rmf]

[^anthropic-autonomy]: Anthropic — Measuring agent autonomy in practice
[^nist-agent-standards]: NIST — AI Agent Standards Initiative
[^nist-rmf]: NIST — AI Risk Management Framework
