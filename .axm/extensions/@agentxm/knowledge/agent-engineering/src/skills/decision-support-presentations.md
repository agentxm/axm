---
type: Reference
title: Decision-support presentations in Agent Skills
description: How a skill applies presentation contracts when comparing alternatives, recommending one, preserving human authority, and holding option labels and the emission surface stable.
tags:
  [
    agent-skills,
    decisions,
    recommendations,
    options,
    presentation-contracts,
    human-authority,
    labels,
    emission-surface,
  ]
status: stable
generated: { by: "claude-code/claude-opus-5", at: 2026-08-16T01:39:08Z }
stale_after: 2027-02-16
sources:
  - id: anthropic-best-practices
    resource: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
    title: Anthropic — Skill authoring best practices
  - id: ipdas-5
    resource: https://www.bmj.com/content/393/bmj-2025-088116
    title: Updated International Patient Decision Aid Standards, version 5.0
  - id: who-goes-first
    resource: https://arxiv.org/abs/2205.09696
    title: Who Goes First? Influences of Human-AI Workflow on Decision Making in Clinical Imaging
---

# Decision-support presentations in Agent Skills

Use this specialization when a skill compares alternatives, recommends one,
and leaves a consequential choice with a human. General prompt and response
contracts determine how model-facing content is structured; skill engineering
adds workflow authority, resource placement, and behavioral exercises.

## Skill contract

At the step that emits the decision, keep one authoritative shape:

1. Decision question and proposed status.
2. Governing evidence, criteria, constraints, and forces.
3. Every viable option in parallel structure and comparable emphasis.
4. Materially considered exclusions, when they affect confidence.
5. One recommendation after the neutral comparison, with rationale tied to the
   stated criteria and consequences.
6. An explicit request for the authorized human to choose, revise, defer, or
   seek more evidence.

Do not label an option as recommended before completing the comparison or
repeat the recommendation in the final choice prompt. Include a no-change
option when it is genuinely viable. These constraints reduce framing while
preserving useful advice.[^ipdas-5]

Put a short strict template at the emitting step. Use one supporting asset only
when the template would obscure the workflow; do not scatter equivalent rules
across prose, examples, and references. Anthropic similarly recommends keeping
skills concise and using supporting resources for depth.[^anthropic-best-practices]

## Stable choice referents

Option labels are contractual, not cosmetic. The human's reply, the decision
ledger, the accepted record, and any later artifact that traces the decision all
name the same option, so the label scheme must be fixed and literal wherever a
skill emits one. Say so at the template: an instruction to adapt detail scopes to
the option content, never to the identifiers.

Hold the scheme stable across the skill's own turns and across sibling skills in
a pack that share a decision ledger. A workflow whose workshop step offers
`Option A` and whose planning step offers `1.` forces the reader to re-anchor and
breaks any record that cites a choice by label.

## Emission surface

A choice can be rendered as ordinary assistant text or through a host affordance
for structured questions. These are different surfaces with different limits: an
affordance typically imposes its own numbering, caps the option count, and
truncates option bodies well below a full comparison.

Name the surface once, at the emitting step, and derive the rest from it:

- when the comparison itself carries the evidence, emit it as text and keep the
  choice request in the same message;
- when a host affordance renders the choice, state which labels it shows and how
  they map to the comparison's identifiers; and
- never emit both an unlabeled affordance and a lettered comparison for the same
  decision.

Leaving the surface unstated is the usual cause of a decision that appears
lettered in one turn and numbered in the next. Choosing per turn is not a
degree of freedom the workflow benefits from.

## Risk-sensitive timing

Advice shown before independent review can increase anchoring.[^who-goes-first]
For high-stakes or preference-sensitive choices, the skill may elicit priorities
or a provisional view before revealing its recommendation. Do not impose that
extra turn when the friction is disproportionate to the decision risk.

## Skill exercises

Vary the number and order of options, which option is recommended, and whether
evidence permits any recommendation. Grade the final response for relative
order, parallel fields, recommendation uniqueness, proposed status, and human
handoff. A semantically complete but structurally invalid response fails the
skill contract.

Grade the label scheme and the emission surface as well, across repeated trials
and consecutive decisions in one session. Scheme drift is invisible to a grader
that reads only one response, and a suite that never varies the host cannot
detect a skill that silently changes surface when an affordance is available.

[^anthropic-best-practices]: Anthropic — Skill authoring best practices

[^ipdas-5]: Updated International Patient Decision Aid Standards, version 5.0

[^who-goes-first]: Who Goes First? Influences of Human-AI Workflow on Decision Making in Clinical Imaging
