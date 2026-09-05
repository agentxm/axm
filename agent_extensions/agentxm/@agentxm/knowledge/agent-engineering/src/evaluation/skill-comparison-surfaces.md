---
type: Explanation
title: Skill comparison surfaces
description: How skill revisions, ablations, hosts, catalogs, and active cohorts provide attributable comparison surfaces, and how judged comparisons stay blind before attribution.
tags: [agent-skills, evaluation, baselines, ablation, hosts, active-cohort, blinding, attribution]
status: stable
generated: { by: "claude-code/claude-opus-5", at: 2026-08-22T14:21:16Z }
stale_after: 2027-02-22
sources:
  - id: skillbench
    resource: https://arxiv.org/abs/2607.13987
    title: SkillBench — Benchmarking Agent Skills
  - id: anthropic-skill-creator-comparator
    resource: https://github.com/anthropics/skills/blob/main/skills/skill-creator/agents/comparator.md
    title: Anthropic — Skill Creator blind comparator
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

## Judge blind, then attribute unblinded

When a comparison rests on judged quality rather than deterministic checks,
separate the verdict from its explanation. Anthropic's Skill Creator splits
these into a blind comparator and a post-hoc analyzer that unblinds the
result.[^anthropic-skill-creator-comparator]

1. **Blind judgment.** Give the judge the task and both outputs under neutral
   labels, withholding which revision, configuration, or author produced each,
   and ask for a decision against a rubric derived from the task rather than
   from either candidate.
2. **Unblinded attribution.** Once the verdict is recorded, reveal both
   revisions and both transcripts and ask what produced the difference: which
   instruction, resource, or omission changed the trajectory, and whether the
   losing side diverged from its own instructions or followed them into a worse
   outcome.

Score instruction-following separately from output quality. A revision whose
instructions were followed exactly and still lost has a design defect; one whose
instructions were ignored has a legibility or authority defect, and the two call
for different repairs.

Attribution is authoring input, not an evaluation conclusion. It proposes
changes and explains a single comparison; it does not extend the claim beyond
the tested cohort, and running it before the blind verdict exists destroys the
blinding it depends on.

[^skillbench]: SkillBench — Benchmarking Agent Skills
[^anthropic-skill-creator-comparator]: Anthropic — Skill Creator blind comparator
