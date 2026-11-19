---
type: Pattern
title: "Scope selector"
description: "Resolve the caller’s intended scope to one or more exact targets and make ambiguous matches selectable."
tags: ["skills", "arguments", "scope", "target", "path", "qualified reference"]
status: draft
sources:
  - id: quality
    resource: https://github.com/qualitymd/quality.md/blob/6291df0e3173bf281f10a2a446a50eed041b7d21/skills/quality/SKILL.md
    title: Quality skill
  - id: checks
    resource: https://github.com/openai/skills/blob/49f948faa9258a0c61caceaf225e179651397431/skills/.curated/gh-fix-ci/SKILL.md
    title: OpenAI GitHub CI repair skill
---

# Scope selector

Accept references a caller already has. OpenAI's CI repair skill accepts a PR
number or URL. Quality accepts a readable label, an area and factor together,
or a qualified model reference.[^checks][^quality]

Resolve a PR number within its repository. For a hierarchical model, resolve
the area first and then search for the factor within it. In a model with an
Accuracy factor under both Triage and Billing, `/quality evaluate Accuracy`
leaves one decision open. Offer those two area names. Given
`/quality evaluate Triage Accuracy`, pass the resolved factor identity to
the evaluator. An explicit qualified reference can address the same factor
directly.

Identify the inventory that owns the target identities and the kinds of
objects this operation accepts. For a review of an installed extension, the
workspace manager can resolve names across skills, knowledge bundles, and
packs. Count distinct identities. Four host projections of one skill give one
choice. A skill, knowledge bundle, and pack all named `docs` give three.
Apply a supplied type or owner first. If several candidates remain, show
their qualified identities and ask for the missing distinction before
inspecting any candidate. “The knowledge bundle” can settle the choice.

Suppose a reader preparing a release asks to review `docs` after discussing
what its packages ship. A review can cover all three matches. Use a native
picker when it can show the complete choice. The same labels, in the same
order, work as short replies in a text-only client.

- **A · All 3 matches (Recommended)** (`all`) — review the three packages below.
- **B · Skill** (`skill`) — `@example/skills/docs`.
- **C · Knowledge bundle** (`knowledge`) — `@example/knowledge/docs`.
- **D · Pack** (`pack`) — `@example/packs/docs`.

Rank by what the caller is trying to do. A question about how `docs` responds
to an invocation favors the skill. With equally plausible scopes, keep a
stable order and leave the labels unmarked. Offer the whole set only when it
is a valid answer. Choosing the single package that should own a new file
calls for the individual owners. Bind the reply to the displayed identities
and continue the original task after the user selects. A highlighted first
row still needs a selection.

Try equivalent references, a collision across types, and a typo. Proceed on
a unique match and report an unknown explicit target. A
[contextual default](contextual-default.md) covers omission.

Scope bounds where the operation acts. A [focus filter](focus-filter.md)
chooses aspects to examine inside that boundary.

[^quality]: Quality, natural labels, area and factor resolution, and canonical references.

[^checks]: OpenAI, PR number or URL as the input to CI inspection.
