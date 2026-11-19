---
type: Pattern
title: "Trigger cues"
description: "Describe the evidence a model can recognize when deciding whether to select a skill."
tags:
  [
    "skills",
    "description",
    "triggers",
    "intent",
    "artifacts",
    "symptoms",
    "workflow phase",
    "environment",
  ]
status: draft
generated: { by: "codex/gpt-6", at: "2026-11-18T23:42:23Z" }
sources:
  - id: figma
    resource: https://github.com/openai/skills/blob/49f948faa9258a0c61caceaf225e179651397431/skills/.curated/figma-implement-design/SKILL.md
    title: OpenAI Figma implementation skill
  - id: pdf
    resource: https://github.com/anthropics/skills/blob/e4bb5d960d87126ff3b3a8af1a104b7db67560ba/skills/pdf/SKILL.md
    title: Anthropic PDF skill
  - id: debug
    resource: https://github.com/obra/superpowers/blob/22f0b463e7a5e579904dd6211a520321035526f7/skills/systematic-debugging/SKILL.md
    title: Superpowers systematic debugging
  - id: verify
    resource: https://github.com/obra/superpowers/blob/22f0b463e7a5e579904dd6211a520321035526f7/skills/verification-before-completion/SKILL.md
    title: Superpowers verification before completion
  - id: ci
    resource: https://github.com/openai/skills/blob/49f948faa9258a0c61caceaf225e179651397431/skills/.curated/gh-fix-ci/SKILL.md
    title: OpenAI GitHub CI repair skill
---

# Trigger cues

Write the description using cues available in the conversation or work already
observed. Use the combination that distinguishes the job from its neighbors.

| Cue                      | Example                                                                                                                |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Requested outcome        | Producing repository code from a design selects the Figma implementation workflow.[^figma]                             |
| Input or output artifact | A PDF supplied for extraction or requested as output gives the PDF skill a common format across several jobs.[^pdf]    |
| Observed symptom         | An unexpected result or a failing test makes a debugging procedure relevant before the cause is known.[^debug]         |
| Workflow phase           | An agent about to report a fix can recognize the moment to verify it.[^verify]                                         |
| Applicable environment   | A failing pull request check **on GitHub Actions** narrows the CI repair workflow to the provider it can inspect.[^ci] |

A file extension by itself can match too broadly. “Explain what a PDF is”
and “extract the totals from these PDFs” share the noun. Only the latter needs
the extraction procedure. Try a paraphrase and a [neighboring intent](neighboring-intent.md)
to see which cue carries the distinction.

The same word can serve two roles. “Evaluate triage accuracy” can help a model
select a quality skill. In `/quality evaluate Triage Accuracy`, the explicit
name selects the skill and `evaluate` is an [operation selector](operation-selector.md).
Compare the operation and target reached through both entry points.

Keep prerequisites where they can be checked. The request to implement a Figma
design can select the right skill before anyone checks whether its connection
works.[^figma] A tool failure at that point concerns execution. A choice among
procedures based on what the tool reveals belongs in [Route after inspection](route-after-inspection.md).

[^figma]: Figma implementation skill, description, boundaries, and prerequisites.

[^pdf]: PDF skill, description and operations.

[^debug]: Systematic debugging, description and entry conditions.

[^verify]: Verification before completion, trigger before a completion claim.

[^ci]: GitHub CI repair, supported checks and provider scope.
