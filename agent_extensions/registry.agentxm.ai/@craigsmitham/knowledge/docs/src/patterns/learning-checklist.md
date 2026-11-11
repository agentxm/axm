---
type: Pattern
title: Learning checklist
description: When learners need support during practice, prompt useful retrieval, reasoning, and reflection with feedback, then fade instructional support and assess later independent performance.
tags: [docs, documentation-pattern, checklist, learning-scaffold, learning, onboarding, practice, retention, transfer, authoring]
status: draft
sources:
- id: checklist-design-origin
  resource: https://github.com/craigsmitham/agent-extensions/blob/156c3d4346bee6874ab3d356c19446cf6425713b/skills/checklist-design/src/references/learning-checklists.md
  title: Craig Smitham — Learning checklists, version 0.1.10
- id: regulated-learning
  resource: https://pubmed.ncbi.nlm.nih.gov/37034913/
  title: Shao et al. — Effects of regulated learning scaffolding on regulation strategies and academic performance
- id: test-enhanced-learning
  resource: https://pubmed.ncbi.nlm.nih.gov/29390949/
  title: Green et al. — Test-enhanced learning in health professions education
- id: expertise-reversal
  resource: https://www.tandfonline.com/doi/abs/10.1207/S15326985EP3801_4
  title: Kalyuga et al. — The expertise reversal effect
generated:
  by: codex/gpt-6
  at: '2026-11-11T17:40:43Z'
---

# Learning checklist

When learners need support during practice, **prompt useful retrieval,
reasoning, and reflection with feedback, then fade instructional support and
assess later independent performance**.

## Problem and design response

A learner can follow visible instructions without being able to recall,
explain, or adapt the work later. A learning checklist uses prompts to support
practice while making the intended independent capability explicit. Completion
with the aid measures supported performance; it does not by itself establish
retention, competence, or transfer.

This pattern develops the former learning-checklist guidance.[^checklist-design-origin]
Research on regulated-learning scaffolds and test-enhanced learning motivates
attention to regulation, retrieval, and measured learning outcomes. Those
interventions cover more than checklists, so their results do not validate this
particular design.[^regulated-learning][^test-enhanced-learning]

## How to write it

- Name what the learner should later recall, explain, decide, or perform,
  their current expertise, and the setting in which that capability matters.
- Place prompts at meaningful practice moments. Where appropriate, ask for
  retrieval, prediction, or explanation before revealing a response.
- Connect consequential actions to their cues, rationale, and consequences.
  Supply or link feedback that distinguishes understanding from a lucky answer.
- Prompt reflection on errors, exceptions, and reasoning when judgment is the
  target. Vary practice conditions when transfer matters.
- Define how instructional detail, prompt frequency, or support will fade.
  Preserve operational verification that remains necessary for competent users.
- Separate participation records, formative feedback, and summative assessment.
  If scoring is used, state what the evidence can and cannot establish.

Use [Tutorial](tutorial.md) for the larger learning experience and
[Checklist](checklist.md) for shared item design and use conditions. When the
task needs substantial explanation, modeling, practice, or coaching, the
checklist is a supporting artifact within that experience.

## Applicability and tradeoffs

Use a learning checklist when bounded prompts can help learners regulate
practice. Use an [execution checklist](execution-checklist.md) for persistent
operational assistance whose success does not depend on later unaided recall.
Do not remove necessary controls merely to demonstrate independence.

Prompts can direct attention while also creating dependence or encouraging
answer copying. Reflection adds useful effort only when learners can connect it
to feedback. Support appropriate for novices can burden experienced users; the
expertise-reversal literature motivates adapting support as expertise changes,
without supplying a universal fading schedule.[^expertise-reversal]

## Illustrative realizations

A novice reviewer might predict likely defects before examining a change,
compare findings with feedback, and explain one missed issue. An onboarding
learner might predict the result of a configuration choice, try it in a practice
environment, and explain a surprising result. Later sessions can reduce prompts
and introduce a different case.

The invariant is supported reasoning with feedback toward independent use;
the prompts and fading conditions vary. These examples are illustrative. A
mandatory acknowledgement list with no practice or feedback does not establish
the same learning mechanism.

## Review and evidence

Choose evidence at the claimed level:

| Claim | Observation |
| --- | --- |
| Aided completion | Task performance with the prompts present |
| Retention or understanding | Delayed recall, explanation, or application |
| Independent performance | Delayed unassisted task execution |
| Transfer | Performance on materially different cases |
| Self-regulation | Planning, monitoring, correction, and reflection without equivalent prompts |

Compare persistent, faded, and absent instructional support when dependence
is a plausible concern. Observe errors, time, calibration, help-seeking, and
exceptions. A collapse without the aid, inability to explain or adapt the work,
or better transfer from another practice method challenges the learning claim.
Delayed evaluation and fading decisions belong in the design, not merely in a
completion report. This draft has not been independently evaluated.

[^checklist-design-origin]: Craig Smitham — Learning checklists, version 0.1.10.
[^regulated-learning]: Shao et al. — Effects of regulated learning scaffolding on regulation strategies and academic performance.
[^test-enhanced-learning]: Green et al. — Test-enhanced learning in health professions education.
[^expertise-reversal]: Kalyuga et al. — The expertise reversal effect.
