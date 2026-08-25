---
type: Reference
title: Baselines, thresholds, aggregation, and slices
description: Makes comparisons and dispositions without allowing aggregate scores to hide critical failures or non-discriminating measures.
tags: [baselines, thresholds, aggregation, cohorts, slices, tradeoffs, discrimination]
status: stable
generated: { by: "claude-code/claude-opus-5", at: 2026-08-22T14:21:16Z }
stale_after: 2027-02-22
sources:
  - id: openai-evals
    resource: https://developers.openai.com/api/docs/guides/evaluation-best-practices
    title: OpenAI — Evaluation best practices
  - id: nist-rmf
    resource: https://airc.nist.gov/airmf-resources/airmf/5-sec-core/
    title: NIST — AI RMF Core
  - id: anthropic-skill-creator-analyzer
    resource: https://github.com/anthropics/skills/blob/main/skills/skill-creator/agents/analyzer.md
    title: Anthropic — Skill Creator benchmark analyzer
---

# Baselines, thresholds, aggregation, and slices

Prefer a decision-relevant comparison: current production, the accepted prior
revision, the same task without the intervention, the simplest viable system,
or a named alternative. Hold unrelated variables constant when attributing a
difference.

Define thresholds before candidate results. Tie them to product requirements,
risk tolerance, uncertainty, and the cost of false acceptance or rejection.
Track quality with latency, cost, authority, safety, and reliability rather
than optimizing one convenience score.

Aggregate only after preserving:

- per-case and per-trial evidence;
- critical dimensions that require independent gates;
- meaningful slices such as task family, user population, language, risk tier,
  host, model, or failure mode; and
- grader disagreements and untested claims.

OpenAI warns that generic aggregate metrics and unrepresentative datasets can
misstate application performance.[^openai-evals] NIST requires context-specific
measurement and documented tradeoffs to support management decisions.[^nist-rmf]

An average improvement cannot compensate for a newly unsafe cohort unless the
accepted policy explicitly permits that tradeoff.

## Check that each measure discriminates

A measure earns its place by separating the configurations under comparison.
Before reading any pass rate, classify each assertion, check, or rubric
dimension by its pattern across those configurations:

| Pattern across configurations | Reading | Action |
| --- | --- | --- |
| Passes everywhere | The baseline already satisfies it | Retire it, or keep it explicitly as a guardrail rather than as evidence of value |
| Fails everywhere | Broken, unobservable, or beyond current capability | Repair the case or withdraw the claim it was meant to support |
| Passes with the intervention, fails without | Attributable value | Keep as primary evidence |
| Fails with the intervention, passes without | A regression an aggregate can absorb | Gate it independently |
| Alternates across trials | Flaky case, unstable grader, or genuinely variable behavior | Add trials before reading a mean |

A suite whose measures nearly all pass everywhere reports a high score while
establishing very little: the aggregate then describes the task rather than the
intervention. Anthropic's Skill Creator runs this classification as a distinct
analysis pass over benchmark results, together with the variance and
resource-cost patterns an aggregate hides.[^anthropic-skill-creator-analyzer]

Discrimination is a property of the suite, not of the target. A measure that
fails this check is a finding against the suite's author, and repairing it
during a controlled run invalidates the comparison it was meant to inform.

[^openai-evals]: OpenAI — Evaluation best practices
[^nist-rmf]: NIST — AI RMF Core
[^anthropic-skill-creator-analyzer]: Anthropic — Skill Creator benchmark analyzer
