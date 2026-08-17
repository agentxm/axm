---
type: Explanation
title: Skill comparison surfaces
description: How skill revisions, ablations, hosts, catalogs, and active cohorts provide attributable comparison surfaces.
tags: [agent-skills, evaluation, baselines, ablation, hosts, active-cohort]
status: stable
generated: { by: "codex/gpt-5.6", at: 2026-08-14T21:14:15Z }
stale_after: 2027-02-14
sources:
  - id: skillbench
    resource: https://arxiv.org/abs/2607.13987
    title: SkillBench — Benchmarking Agent Skills
---

# Skill comparison surfaces

Choose the comparison that can attribute a difference to the skill:

- the same task without the skill for incremental value;
- the accepted published revision for compatibility and regression;
- the same activated skill across claimed hosts or models for portability;
- isolation versus semantic neighbors for routing collision;
- the actual active catalog cohort for deployment behavior; or
- a named alternative skill only when both claim the same job.

Hold task, model, host, fixtures, catalog, grader, and trial policy constant
except for the surface under comparison. Record effective host behavior: an
identical package can route differently when catalog membership or invocation
policy changes. Recent benchmark work likewise treats skills as artifacts that
require comparative task evidence.[^skillbench]

Repeat variable cases under the governing evaluation policy, but interpret the
result at the skill boundary: was the difference caused by routing metadata,
activated workflow instructions, packaged resources, coexistence, unavailable
host capability, or the evaluator?

Do not compare an explicitly invoked candidate with an implicitly routed
baseline; that changes both routing and execution at once.

[^skillbench]: SkillBench — Benchmarking Agent Skills
