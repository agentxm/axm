---
type: Pattern
title: "Contextual default"
description: "When an argument is omitted, use the operation and available evidence to decide whether its value can be inferred."
tags: ["skills", "arguments", "omission", "default", "current branch", "ambiguity"]
status: draft
sources:
  - id: checks
    resource: https://github.com/openai/skills/blob/49f948faa9258a0c61caceaf225e179651397431/skills/.curated/gh-fix-ci/SKILL.md
    title: OpenAI GitHub CI repair skill
  - id: quality
    resource: https://github.com/qualitymd/quality.md/blob/6291df0e3173bf281f10a2a446a50eed041b7d21/skills/quality/SKILL.md
    title: Quality skill
---

# Contextual default

OpenAI's CI repair skill looks up the current branch's PR when the caller
omits one. An explicit PR number or URL takes precedence.[^checks] Quality
offers orientation on bare invocation and evaluates the full model when the
caller explicitly chooses evaluation without a scope.[^quality] The presence
of the operation changes what omission means.

For each optional input, identify the evidence that supplies its value and what
happens when the evidence runs out. A branch with one associated PR can settle
the target of a review. On a branch with no PR, ask which PR to inspect when
one is required. An explicit PR that fails to resolve still names the caller's
intended scope. Report the failed lookup before doing work on another target.

An explicit name can also resolve to several targets. If a workspace has a
skill and a pack named `docs`, an earlier discussion about skills is a poor
default for “review docs.” Ask which matching extension the caller means.
“Review the docs skill” already supplies the distinction.

State consequential defaults in the invocation examples. Try a bare request,
an operation without a scope, an unknown name, and an ambiguous name.
Observe the target actually inspected. An accidental full-workspace review
can return plausible findings even when the caller named one package.

[^checks]: OpenAI, explicit PR and current-branch lookup.

[^quality]: Quality, read-only orientation and the evaluation scope default.
