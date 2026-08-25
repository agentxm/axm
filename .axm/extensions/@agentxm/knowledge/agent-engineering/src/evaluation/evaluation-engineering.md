---
type: Explanation
title: Evaluation engineering
description: Defines evaluation engineering as a cross-cutting assurance discipline tied to decisions and deployment context.
tags: [ai-evaluation, measurement, assurance, decision-support, deployment-context]
status: stable
generated: { by: "codex/gpt-5.6", at: 2026-08-14T22:24:33Z }
stale_after: 2027-02-14
sources:
  - id: openai-evals
    resource: https://developers.openai.com/api/docs/guides/evaluation-best-practices
    title: OpenAI — Evaluation best practices
  - id: nist-rmf
    resource: https://airc.nist.gov/airmf-resources/airmf/5-sec-core/
    title: NIST — AI RMF Core
---

# Evaluation engineering

**Evaluation engineering** designs, validates, operates, and maintains
measurement systems that estimate how a named AI system behaves over a relevant
distribution of tasks and conditions in support of a named decision.

It is an assurance plane across construction disciplines, not a child of any
one target:

| Target discipline | Supplies to evaluation |
| --- | --- |
| Prompt engineering | Prompt identity, direct behavior, response contracts |
| Context engineering | Selection, authority, freshness, use, and economy |
| Agent engineering | Goal contract, model, tools, memory policy, topology, autonomy, termination, recovery, trajectories, outcomes |
| Harness engineering | Runtime identity, environments, authority, traces, state |
| Skill engineering | Routing, activated execution, coexistence, packaged resources |
| Application or domain | User value, harm, quality, and acceptable tradeoffs |

Evaluation engineering owns the shared method: objectives, task distributions,
trials, evidence, graders, baselines, uncertainty, aggregation, validity, and
lifecycle. A score without those identities is not an attributable evaluation.

The target discipline supplies scenarios and obligations specific to its
behavior. For agents, that includes tool and observation choices, replanning,
stopping, recovery, memory influence, delegation, human intervention, external
effects, safety, and cost. Evaluation engineering retains ownership of case
sampling, trials, graders, uncertainty, aggregation, and validity.

OpenAI recommends task-specific, continuous evaluations aligned to real use
rather than generic metrics alone.[^openai-evals] NIST places measurement after
context mapping and requires uncertainty, documented methods, deployment-like
conditions, and regular reassessment.[^nist-rmf]

[^openai-evals]: OpenAI — Evaluation best practices
[^nist-rmf]: NIST — AI RMF Core
