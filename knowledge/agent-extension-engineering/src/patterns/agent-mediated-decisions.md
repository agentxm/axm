---
type: Pattern
title: "Agent-mediated decisions"
description: "When a workflow depends on a user decision, show what the choice changes and make the proposed answer easy to correct."
tags: ["skills", "user interaction", "choices", "confirmation", "text fallback"]
status: draft
generated: { by: "codex/gpt-6", at: "2026-11-18T23:13:12Z" }
sources:
  - id: setup
    resource: https://github.com/qualitymd/quality.md/blob/6291df0e3173bf281f10a2a446a50eed041b7d21/skills/quality/workflows/setup.md
    title: Quality setup workflow
  - id: interaction
    resource: https://github.com/qualitymd/quality.md/blob/6291df0e3173bf281f10a2a446a50eed041b7d21/docs/guides/agent-mediated-ux.md
    title: Agent-mediated UX
  - id: sketch
    resource: https://github.com/obra/superpowers/blob/22f0b463e7a5e579904dd6211a520321035526f7/skills/brainstorming/SKILL.md
    title: Superpowers brainstorming skill
  - id: outputs
    resource: https://github.com/anthropics/skills/blob/e4bb5d960d87126ff3b3a8af1a104b7db67560ba/skills/skill-creator/SKILL.md
    title: Anthropic skill creator
---

# Agent-mediated decisions

An agent can discover what a project contains. Sometimes only its user can
say what the project is meant to do. At that point, show the choice in terms
the user can judge, explain its consequence, and offer a grounded default they
can correct. Quality setup illustrates this with a draft set of quality
factors. The user can name a missing concern before the skill writes the
model, without having to review its YAML.[^setup]

Suppose a team wants agents to follow a build convention. You found the
affected package, but the intended reach is unclear. An authoring skill might
ask, “Who else needs this convention? All the examples are in the website
package, so I’d put the instruction there. If another repository needs the
same guidance, name it and we can design a shared rule.” The answer changes
what gets authored and which workspaces can use it.

A picker can show those choices when the host supports it. Keep the evidence
and consequence visible, and allow a short text reply or a correction that
doesn't fit the choices. Try the exchange in plain text to see whether a
reader can still tell what they are deciding.[^interaction]

When the user can recognize a good result more easily than they can describe
it, put a small sample in front of them. Superpowers uses sketches and
side-by-side mockups for visual choices.[^sketch] Anthropic’s skill creator
lets authors inspect actual trial outputs while revising a skill.[^outputs]
For a review skill, show two findings about the same broken link, one written
for the package author and one for the installer. Ask which reader should
be able to act on the result. A short pair of drafts can settle the audience
before the author spends time polishing the reporting format.

A checkpoint costs attention. Quality setup deliberately spends some of it
teaching a first-time model author what each choice controls.[^setup] On a
routine edit, use the scope the user already gave. Ask when a different answer
would materially change the result.

[^setup]: Quality setup workflow, discovery questions and factor proposal checkpoint.

[^interaction]: Agent-mediated UX, channels and progressive enhancement.

[^sketch]: Superpowers brainstorming skill, visual companion.

[^outputs]: Anthropic skill creator, reviewing trial outputs.
